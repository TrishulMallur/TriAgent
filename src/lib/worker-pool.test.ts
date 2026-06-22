import { describe, it, expect, vi } from 'vitest';
import { WorkerPool, defaultConcurrencyFor } from './worker-pool';

/**
 * Tiny utility · returns a promise that resolves to `value` after `ms`,
 * tracking concurrency via a shared counter so we can assert that the pool
 * truly caps in-flight workers.
 */
function makeTrackedWorker(latencyMs: number) {
  const state = { active: 0, peakActive: 0 };
  const worker = async (item: number) => {
    state.active += 1;
    state.peakActive = Math.max(state.peakActive, state.active);
    await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
    state.active -= 1;
    return item * 2;
  };
  return { state, worker };
}

async function collect<T, R>(
  gen: AsyncGenerator<{ item: T; result?: R; error?: Error; index: number }>,
): Promise<Array<{ item: T; result?: R; error?: Error; index: number }>> {
  const out: Array<{ item: T; result?: R; error?: Error; index: number }> = [];
  for await (const r of gen) out.push(r);
  return out;
}

describe('WorkerPool', () => {
  it('respects the concurrency cap (peak in-flight never exceeds the limit)', async () => {
    const pool = new WorkerPool<number, number>(3);
    const { state, worker } = makeTrackedWorker(50);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = await collect(pool.run(items, worker));
    expect(results).toHaveLength(items.length);
    expect(state.peakActive).toBeLessThanOrEqual(3);
    expect(state.peakActive).toBeGreaterThan(1); // sanity · we did parallelise
    // All items processed; indices unique
    const indices = results.map((r) => r.index).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.result).toBe(r.item * 2);
    }
  });

  it('concurrency=1 serialises the workload (peak active = 1)', async () => {
    const pool = new WorkerPool<number, number>(1);
    const { state, worker } = makeTrackedWorker(20);
    await collect(pool.run([1, 2, 3, 4], worker));
    expect(state.peakActive).toBe(1);
  });

  it('errors thrown by one worker do not abort the batch', async () => {
    const pool = new WorkerPool<number, number>(2);
    const worker = async (item: number) => {
      await new Promise<void>((r) => setTimeout(r, 10));
      if (item === 2) throw new Error('boom on 2');
      return item * 10;
    };
    const results = await collect(pool.run([1, 2, 3, 4], worker));
    expect(results).toHaveLength(4);
    const byIndex = new Map(results.map((r) => [r.index, r]));
    expect(byIndex.get(0)?.result).toBe(10);
    expect(byIndex.get(1)?.error?.message).toBe('boom on 2');
    expect(byIndex.get(1)?.result).toBeUndefined();
    expect(byIndex.get(2)?.result).toBe(30);
    expect(byIndex.get(3)?.result).toBe(40);
  });

  it('yields per-item results as they complete (faster items emit first)', async () => {
    const pool = new WorkerPool<number, number>(3);
    // Item with smallest latency should emit first regardless of input order.
    const latencies = [80, 20, 50];
    const worker = async (item: number) => {
      await new Promise<void>((r) => setTimeout(r, latencies[item]));
      return item;
    };
    const results = await collect(pool.run([0, 1, 2], worker));
    // First emitted result should be the fastest worker (index=1, 20ms).
    expect(results[0].index).toBe(1);
  });

  it('abort() stops in-flight workers and marks remaining items as AbortError', async () => {
    const pool = new WorkerPool<number, number>(2);
    const seen: number[] = [];
    const worker = async (item: number, signal: AbortSignal) => {
      seen.push(item);
      // Long-running · we'll abort during this wait
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 200);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return item;
    };

    const items = [10, 11, 12, 13, 14];
    const runPromise = collect(pool.run(items, worker));

    // Trigger abort after the first two workers are in-flight
    await new Promise<void>((r) => setTimeout(r, 30));
    pool.abort();

    const results = await runPromise;
    expect(results).toHaveLength(items.length);
    // Every result should be an error (either AbortError from worker or
    // pre-dispatch AbortError marker from the pool).
    for (const r of results) {
      expect(r.error).toBeDefined();
    }
    // Items that never started should be flagged AbortError by the pool.
    const notStarted = items.filter((it) => !seen.includes(it));
    for (const item of notStarted) {
      const idx = items.indexOf(item);
      expect(results.find((r) => r.index === idx)?.error?.name).toBe('AbortError');
    }
  });

  it('empty input returns immediately without invoking the worker', async () => {
    const pool = new WorkerPool<number, number>(3);
    const worker = vi.fn(async (n: number) => n);
    const results = await collect(pool.run([], worker));
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('throws if concurrency < 1', () => {
    expect(() => new WorkerPool<number, number>(0)).toThrow(/>= 1/);
    expect(() => new WorkerPool<number, number>(-3)).toThrow(/>= 1/);
    expect(() => new WorkerPool<number, number>(Number.NaN)).toThrow(/>= 1/);
  });

  it('honours an externally-supplied AbortSignal', async () => {
    const pool = new WorkerPool<number, number>(2);
    const externalCtl = new AbortController();
    const worker = async (item: number, signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 200);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return item;
    };
    const runPromise = collect(
      pool.run([1, 2, 3, 4], worker, { signal: externalCtl.signal }),
    );
    await new Promise<void>((r) => setTimeout(r, 30));
    externalCtl.abort();
    const results = await runPromise;
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.error).toBeDefined();
  });
});

describe('defaultConcurrencyFor', () => {
  it('returns 1 for local single-thread providers', () => {
    expect(defaultConcurrencyFor('lmstudio')).toBe(1);
    expect(defaultConcurrencyFor('llamacpp')).toBe(1);
  });

  it('returns 3 for cloud providers and mock', () => {
    expect(defaultConcurrencyFor('claude')).toBe(3);
    expect(defaultConcurrencyFor('gemini')).toBe(3);
    expect(defaultConcurrencyFor('mock')).toBe(3);
  });

  it('returns 3 for unknown providers (sensible default)', () => {
    expect(defaultConcurrencyFor('something-new')).toBe(3);
  });
});
