/**
 * Pure-logic concurrency-bounded worker pool.
 *
 * Iterates over a list of items, invoking a worker function on each one with
 * a configurable concurrency cap. Yields per-item results as they complete
 * (out of order · whichever worker finishes first emits first), so the UI
 * can update incrementally rather than waiting for the whole batch.
 *
 * Used by the bulk-ingestion queue to extract multiple transfer documents
 * in parallel without hammering the LLM provider:
 *   - Cloud providers (Claude, Gemini)         → concurrency = 3
 *   - Local single-thread inference (LM Studio, llama.cpp) → concurrency = 1
 *
 * Errors thrown by individual workers are captured into the yielded result
 * rather than rethrown · one failing file must not abort the entire batch.
 *
 * `abort()` (or aborting the supplied controller) signals all in-flight
 * workers via the per-call `AbortSignal`. Items not yet started are skipped
 * entirely. In-flight workers are responsible for honouring the signal.
 */

export interface WorkerPoolResult<T, R> {
  /** The original item this result corresponds to. */
  item: T;
  /** The index of the item in the input array (lets the UI map back to a row). */
  index: number;
  /** Present iff the worker resolved successfully. */
  result?: R;
  /** Present iff the worker threw. The batch continues regardless. */
  error?: Error;
  /** Wall-clock duration of the worker call in milliseconds. */
  durationMs: number;
}

export interface WorkerPoolOptions {
  /** External abort controller. If omitted, an internal one is created. */
  signal?: AbortSignal;
}

export class WorkerPool<T, R> {
  private readonly concurrency: number;
  private readonly internalController: AbortController;

  constructor(concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new Error(`WorkerPool concurrency must be >= 1, got ${concurrency}`);
    }
    this.concurrency = Math.floor(concurrency);
    this.internalController = new AbortController();
  }

  /**
   * Abort any in-flight workers and skip the remainder of the batch.
   * Idempotent.
   */
  abort(): void {
    this.internalController.abort();
  }

  /**
   * Process `items` with the given worker function and yield results as they
   * complete. Order of yielded results is whichever worker finishes first ·
   * use `result.index` to map back to the input position.
   *
   * Implementation notes:
   *   - Concurrency cap is enforced via `Promise.race` over the active set.
   *     We don't reach for a fancy semaphore class because the dispatch loop
   *     is the only consumer.
   *   - On abort, items that haven't been dispatched yet are emitted with
   *     an `AbortError` so the caller can mark them as cancelled cleanly.
   */
  async *run(
    items: T[],
    worker: (item: T, signal: AbortSignal) => Promise<R>,
    options: WorkerPoolOptions = {},
  ): AsyncGenerator<WorkerPoolResult<T, R>, void, void> {
    if (items.length === 0) return;

    // Wire the external signal (if any) to abort our internal controller too.
    const cleanupExternal = options.signal
      ? wireSignals(options.signal, this.internalController)
      : () => {};

    const signal = this.internalController.signal;

    type ActiveEntry = {
      key: symbol;
      index: number;
      item: T;
      startedAt: number;
      promise: Promise<{
        key: symbol;
        index: number;
        item: T;
        result?: R;
        error?: Error;
        durationMs: number;
      }>;
    };

    const active = new Map<symbol, ActiveEntry>();
    let nextIndex = 0;

    const dispatch = (): void => {
      while (active.size < this.concurrency && nextIndex < items.length && !signal.aborted) {
        const index = nextIndex++;
        const item = items[index];
        const key = Symbol(`worker-${index}`);
        const startedAt = performance.now();
        const promise = Promise.resolve()
          .then(() => worker(item, signal))
          .then(
            (result) => ({
              key,
              index,
              item,
              result,
              durationMs: performance.now() - startedAt,
            }),
            (err: unknown) => ({
              key,
              index,
              item,
              error: err instanceof Error ? err : new Error(String(err)),
              durationMs: performance.now() - startedAt,
            }),
          );
        active.set(key, { key, index, item, startedAt, promise });
      }
    };

    try {
      dispatch();

      while (active.size > 0) {
        const settled = await Promise.race(
          Array.from(active.values()).map((entry) => entry.promise),
        );
        active.delete(settled.key);
        yield {
          item: settled.item,
          index: settled.index,
          result: settled.result,
          error: settled.error,
          durationMs: settled.durationMs,
        };
        // After abort, do NOT dispatch new work · but DO continue draining
        // the active set so every in-flight worker's outcome is yielded.
        // The worker function is expected to reject with AbortError once the
        // signal fires; if it doesn't, the result still surfaces.
        if (!signal.aborted) dispatch();
      }

      // Drain any not-yet-dispatched items as AbortError so callers don't
      // have to track "what didn't start". Skip if everything was already
      // dispatched and we exited cleanly.
      if (signal.aborted && nextIndex < items.length) {
        for (let i = nextIndex; i < items.length; i++) {
          yield {
            item: items[i],
            index: i,
            error: new DOMException('Aborted', 'AbortError'),
            durationMs: 0,
          };
        }
      }
    } finally {
      cleanupExternal();
    }
  }
}

/**
 * Bridge an external `AbortSignal` to an internal controller. Returns a
 * cleanup function that detaches the listener · callers must invoke it once
 * the operation completes so we don't leak references when the same external
 * signal outlives many pools.
 */
function wireSignals(external: AbortSignal, internal: AbortController): () => void {
  if (external.aborted) {
    internal.abort();
    return () => {};
  }
  const onAbort = () => internal.abort();
  external.addEventListener('abort', onAbort);
  return () => external.removeEventListener('abort', onAbort);
}

/**
 * Convenience helper used by the bulk-ingestion UI: pick a sensible default
 * concurrency based on the active LLM provider id.
 *
 *   - Cloud (Claude, Gemini)     → 3 (rate-limit headroom)
 *   - Local (LM Studio, llama.cpp) → 1 (single-thread inference)
 *   - Mock                        → 3 (no real bottleneck · exercises pool)
 */
export function defaultConcurrencyFor(providerId: string): number {
  switch (providerId) {
    case 'lmstudio':
    case 'llamacpp':
      return 1;
    case 'claude':
    case 'gemini':
    case 'mock':
    default:
      return 3;
  }
}
