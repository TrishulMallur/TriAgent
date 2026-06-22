/**
 * AI-layer error types.
 *
 * Providers throw `AiHttpError` on non-2xx HTTP responses so the retry helper
 * can branch on `.status` and respect `.retryAfter` from the server without
 * regexing free-form messages.
 *
 * `parseAndValidate` throws `AiResponseError` when an LLM returns malformed
 * JSON or a shape that doesn't match the expected zod schema. The raw text
 * stays attached so the UI can offer a copy-to-clipboard button for the
 * model's actual output (helps file local-LLM bug reports).
 */

export class AiHttpError extends Error {
  readonly name = 'AiHttpError';
  constructor(
    public readonly status: number,
    public readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message);
  }
}

export class AiResponseError extends Error {
  readonly name = 'AiResponseError';
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Parse an HTTP `Retry-After` header into a number of seconds, or null if
 * missing/unparseable. Accepts both delta-seconds and HTTP-date forms.
 */
export function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  // Delta-seconds: integer number of seconds.
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, parseInt(trimmed, 10));
  }
  // HTTP-date: absolute time.
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return null;
}
