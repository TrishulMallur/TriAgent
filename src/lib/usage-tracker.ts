/**
 * Session-wide AI usage tracker.
 *
 * Singleton · `ai.ts` calls `recordUsage(...)` after every successful AI call
 * (cache hits report zero tokens). React contexts and hooks subscribe via
 * `subscribe(cb)` to keep their UI in sync. `resetSession()` zeros everything.
 *
 * Pure logic, no React. Lives outside the React tree so non-React modules
 * (e.g. background tasks) can also record without bouncing through context.
 */

import type { ProviderId, TokenUsage } from './llm-provider';
import { calculateCost } from './pricing';

export interface SessionTotals {
  /** Total successful AI calls in the session (including cache hits). */
  callCount: number;
  /** Sum of input + output tokens across all calls (cache hits add 0). */
  totalTokens: number;
  /** Sum of input tokens only. */
  inputTokens: number;
  /** Sum of output tokens only. */
  outputTokens: number;
  /** USD cost · only counts calls where pricing is known. */
  totalCostUsd: number;
  /** Subset of `callCount` that were cache hits (0 tokens, 0 cost). */
  cacheHitCount: number;
}

export interface RecordedCall {
  providerId: ProviderId;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  cached: boolean;
  /** Epoch ms when the call was recorded. */
  at: number;
}

type Subscriber = (totals: SessionTotals) => void;

const EMPTY_TOTALS: SessionTotals = {
  callCount: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  cacheHitCount: 0,
};

let _totals: SessionTotals = { ...EMPTY_TOTALS };
let _lastCall: RecordedCall | null = null;
const _subscribers = new Set<Subscriber>();

function notify(): void {
  for (const cb of _subscribers) {
    try {
      cb(_totals);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[usage-tracker] subscriber threw · ignoring:', err);
    }
  }
}

/**
 * Record a single AI call's usage. Called by `runAnalysis` and
 * `runAnalysisStreaming` after a successful response (or after a cache hit).
 *
 * @param providerId  The provider that served the call.
 * @param model       Model tag (e.g. 'claude-sonnet-4-20250514'). Used to look
 *                    up pricing.
 * @param usage       Token counts + duration. Use `{ inputTokens: 0, outputTokens: 0 }`
 *                    for cache hits · they consumed no tokens this run.
 * @param cached      True if the response came from the in-memory cache.
 */
export function recordUsage(
  providerId: ProviderId,
  model: string,
  usage: TokenUsage,
  cached = false,
): RecordedCall {
  const costUsd = cached ? 0 : calculateCost(providerId, model, usage);
  const totalForCall = usage.totalTokens ?? usage.inputTokens + usage.outputTokens;

  _totals = {
    callCount: _totals.callCount + 1,
    totalTokens: _totals.totalTokens + totalForCall,
    inputTokens: _totals.inputTokens + usage.inputTokens,
    outputTokens: _totals.outputTokens + usage.outputTokens,
    totalCostUsd: _totals.totalCostUsd + (costUsd ?? 0),
    cacheHitCount: _totals.cacheHitCount + (cached ? 1 : 0),
  };

  _lastCall = {
    providerId,
    model,
    usage,
    costUsd: cached ? 0 : costUsd,
    cached,
    at: Date.now(),
  };

  notify();
  return _lastCall;
}

/** Read a snapshot of the current session totals (immutable). */
export function getSessionTotals(): SessionTotals {
  return { ..._totals };
}

/** Read the most recently recorded call (or null if none yet). */
export function getLastCall(): RecordedCall | null {
  return _lastCall ? { ..._lastCall } : null;
}

/**
 * Subscribe to totals updates. Returns an unsubscribe function. The callback
 * is invoked every time `recordUsage` or `resetSession` runs. NOT called
 * immediately on subscribe · read via `getSessionTotals()` if you need the
 * current value.
 */
export function subscribe(cb: Subscriber): () => void {
  _subscribers.add(cb);
  return () => {
    _subscribers.delete(cb);
  };
}

/** Reset totals and clear the last-call pointer. Notifies subscribers. */
export function resetSession(): void {
  _totals = { ...EMPTY_TOTALS };
  _lastCall = null;
  notify();
}

// Test-only: wipe subscribers between tests. Production code never needs this.
/** @internal */
export function _clearSubscribersForTests(): void {
  _subscribers.clear();
}
