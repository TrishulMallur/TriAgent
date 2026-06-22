/**
 * Auto-retry with exponential backoff for AI provider calls.
 *
 * Retries on transient HTTP failures (408/429/500/502/503/504), network
 * errors (fetch throws TypeError), and one schema-validation failure
 * (`AiResponseError`) in case the model emitted a one-off bad token.
 *
 * Never retries on configuration errors (400/401/403) · those won't fix
 * themselves and retrying just delays the user-visible failure.
 *
 * Respects `Retry-After` from the server when present (`AiHttpError.retryAfterSeconds`).
 */

import { AiHttpError, AiResponseError } from './errors';

export interface RetryOptions {
  maxAttempts?: number; // total attempts including the first try (default 4 = first + 3 retries)
  baseDelayMs?: number; // first retry delay (default 1000)
  maxDelayMs?: number; // cap for a single delay (default 30s)
  maxSchemaRetries?: number; // schema errors are expensive · cap separately (default 1)
  jitter?: boolean; // add up to 25% jitter (default true)
  onRetry?: (info: RetryInfo) => void; // observability hook
  sleep?: (ms: number) => Promise<void>; // injectable for tests
}

export interface RetryInfo {
  attempt: number; // 1-indexed attempt number that just failed
  delayMs: number; // delay before the next attempt
  error: unknown;
  reason: 'http' | 'network' | 'schema';
}

const RETRIABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const NON_RETRIABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

function classify(err: unknown): RetryInfo['reason'] | null {
  if (err instanceof AiHttpError) {
    if (RETRIABLE_STATUSES.has(err.status)) return 'http';
    if (NON_RETRIABLE_STATUSES.has(err.status)) return null;
    // Other 4xx/5xx: be conservative · retry 5xx, don't retry unknown 4xx.
    if (err.status >= 500) return 'http';
    return null;
  }
  if (err instanceof AiResponseError) return 'schema';
  // TypeError is what `fetch` throws on network failure (DNS, connection refused).
  if (err instanceof TypeError) return 'network';
  // Some runtimes mark abort as AbortError on a DOMException.
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return 'network';
  }
  return null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(
  attempt: number,
  err: unknown,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
): number {
  // Server-directed Retry-After always wins.
  if (err instanceof AiHttpError && err.retryAfterSeconds != null) {
    return Math.min(err.retryAfterSeconds * 1000, maxDelayMs);
  }
  // Exponential: base * 2^(attempt-1)  →  1s, 2s, 4s, 8s, ...
  const exp = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exp, maxDelayMs);
  if (!jitter) return capped;
  // Decorrelated jitter: add 0-25% on top so concurrent callers don't sync.
  return Math.round(capped * (1 + Math.random() * 0.25));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    maxSchemaRetries = 1,
    jitter = true,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let schemaRetries = 0;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const reason = classify(err);
      if (reason === null) throw err; // not retriable · fail fast

      if (reason === 'schema') {
        if (schemaRetries >= maxSchemaRetries) throw err;
        schemaRetries++;
      }

      if (attempt >= maxAttempts) throw err;

      const delayMs = computeDelay(attempt, err, baseDelayMs, maxDelayMs, jitter);

      // eslint-disable-next-line no-console
      console.info(
        `[retry] attempt ${attempt}/${maxAttempts} failed (${reason}); waiting ${delayMs}ms before retry`,
        err instanceof Error ? err.message : err,
      );
      onRetry?.({ attempt, delayMs, error: err, reason });

      await sleep(delayMs);
    }
  }

  // Should be unreachable: the loop either returns or throws.
  throw lastErr ?? new Error('withRetry: exhausted attempts without an error');
}
