import { describe, it, expect, vi } from 'vitest';
import { withRetry, type RetryInfo } from './retry';
import { AiHttpError, AiResponseError } from './errors';

const noopSleep = async (_ms: number) => {};

function makeSleepRecorder() {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  return { sleeps, sleep };
}

describe('withRetry', () => {
  it('returns the value on first-try success without retrying', async () => {
    const fn = vi.fn(async () => 'ok');
    const onRetry = vi.fn();
    const result = await withRetry(fn, { sleep: noopSleep, onRetry, jitter: false });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries on 503 then succeeds; onRetry fires once with reason "http"', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new AiHttpError(503, null, 'server down');
      return 'ok';
    });
    const onRetry = vi.fn<(info: RetryInfo) => void>();
    const result = await withRetry(fn, { sleep: noopSleep, onRetry, jitter: false });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].reason).toBe('http');
  });

  it('retries on 429 then succeeds with reason "http"', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new AiHttpError(429, null, 'rate limited');
      return 'ok';
    });
    const onRetry = vi.fn<(info: RetryInfo) => void>();
    await withRetry(fn, { sleep: noopSleep, onRetry, jitter: false });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].reason).toBe('http');
  });

  it('retries on TypeError (network) with reason "network"', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new TypeError('fetch failed');
      return 'ok';
    });
    const onRetry = vi.fn<(info: RetryInfo) => void>();
    const result = await withRetry(fn, { sleep: noopSleep, onRetry, jitter: false });
    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].reason).toBe('network');
  });

  it('does NOT retry on 401 · throws immediately', async () => {
    const err = new AiHttpError(401, null, 'unauthorized');
    const fn = vi.fn(async () => {
      throw err;
    });
    const onRetry = vi.fn();
    await expect(withRetry(fn, { sleep: noopSleep, onRetry, jitter: false })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does NOT retry on 400', async () => {
    const err = new AiHttpError(400, null, 'bad request');
    const fn = vi.fn(async () => {
      throw err;
    });
    const onRetry = vi.fn();
    await expect(withRetry(fn, { sleep: noopSleep, onRetry, jitter: false })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does NOT retry on 403', async () => {
    const err = new AiHttpError(403, null, 'forbidden');
    const fn = vi.fn(async () => {
      throw err;
    });
    const onRetry = vi.fn();
    await expect(withRetry(fn, { sleep: noopSleep, onRetry, jitter: false })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('caps schema retries · the second AiResponseError is thrown', async () => {
    const err1 = new AiResponseError('bad json 1', 'raw1');
    const err2 = new AiResponseError('bad json 2', 'raw2');
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw err1;
      if (attempts === 2) throw err2;
      return 'ok';
    });
    const onRetry = vi.fn<(info: RetryInfo) => void>();
    await expect(withRetry(fn, { sleep: noopSleep, onRetry, jitter: false })).rejects.toBe(err2);
    // First schema error caused a retry; second hit the cap and threw.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].reason).toBe('schema');
  });

  it('respects Retry-After on 429 · next sleep delay equals retryAfterSeconds * 1000', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new AiHttpError(429, 7, 'rate limited');
      return 'ok';
    });
    const { sleeps, sleep } = makeSleepRecorder();
    await withRetry(fn, { sleep, jitter: false });
    expect(sleeps.length).toBe(1);
    expect(Math.abs(sleeps[0] - 7000)).toBeLessThanOrEqual(50);
  });

  it('exhausts maxAttempts and throws the original error', async () => {
    const err = new AiHttpError(503, null, 'still down');
    const fn = vi.fn(async () => {
      throw err;
    });
    const onRetry = vi.fn();
    await expect(
      withRetry(fn, { sleep: noopSleep, onRetry, jitter: false, maxAttempts: 2 }),
    ).rejects.toBe(err);
    // 2 total attempts → 1 retry between them.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff with jitter: false → 1000ms, 2000ms, 4000ms', async () => {
    const fn = vi.fn(async () => {
      throw new AiHttpError(503, null, 'down');
    });
    const { sleeps, sleep } = makeSleepRecorder();
    await expect(
      withRetry(fn, { sleep, jitter: false, maxAttempts: 4, baseDelayMs: 1000 }),
    ).rejects.toBeInstanceOf(AiHttpError);
    // maxAttempts=4 → fails on attempts 1,2,3 each followed by sleep; throws on 4.
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });
});
