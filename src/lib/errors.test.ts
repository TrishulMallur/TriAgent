import { describe, it, expect } from 'vitest';
import { parseRetryAfter, AiHttpError, AiResponseError } from './errors';

describe('parseRetryAfter', () => {
  it('parses integer delta-seconds', () => {
    expect(parseRetryAfter('5')).toBe(5);
  });

  it('handles zero', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('handles negative number strings · clamped to 0 (not retryable as delta-seconds)', () => {
    // Implementation note: /^\d+$/ rejects the leading "-", so the value falls
    // through to Date.parse. In V8, "-3" parses as a year in the distant past,
    // which the function clamps to 0. Either way, no negative seconds escape.
    const result = parseRetryAfter('-3');
    expect(result === 0 || result === null).toBe(true);
  });

  it('returns null for missing/null/undefined/empty', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
  });

  it('returns a positive integer for an HTTP-date in the future', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const result = parseRetryAfter(future);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    // Should be within a few seconds of 60.
    expect(result!).toBeLessThanOrEqual(60);
    expect(result!).toBeGreaterThanOrEqual(55);
  });

  it('returns 0 for an HTTP-date in the past (clamped)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it('returns null for a garbage string', () => {
    expect(parseRetryAfter('not-a-date-at-all')).toBeNull();
  });
});

describe('AiHttpError / AiResponseError shape', () => {
  it('AiHttpError carries status and retryAfterSeconds', () => {
    const err = new AiHttpError(429, 7, 'rate limited');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AiHttpError');
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(7);
    expect(err.message).toBe('rate limited');
  });

  it('AiResponseError carries rawResponse and cause', () => {
    const cause = new Error('parse failed');
    const err = new AiResponseError('bad', '{not json', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AiResponseError');
    expect(err.rawResponse).toBe('{not json');
    expect(err.cause).toBe(cause);
  });
});
