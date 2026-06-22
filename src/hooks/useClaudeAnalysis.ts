import { useState, useCallback, useRef } from 'react';
import type { AnalysisStatus } from '@/components/shared/AiAnalysisContainer';
import { AiResponseError } from '@/lib/errors';
import { skipNextCacheRead } from '@/lib/ai';
import { getLastCall, type RecordedCall } from '@/lib/usage-tracker';

interface UseClaudeAnalysisReturn<T> {
  analyze: (...args: unknown[]) => Promise<void>;
  /** Re-run the most recent analyze() call with the same args, bypassing the response cache. */
  rerun: () => Promise<void>;
  result: T | null;
  status: AnalysisStatus;
  error: string | null;
  rawResponse: string | null;
  /**
   * Usage and cost for the MOST RECENT call this hook completed. Sourced from
   * `usage-tracker.getLastCall()` after the call resolves. Null until the
   * first call succeeds; null while a new call is in-flight.
   */
  lastUsage: RecordedCall | null;
  /**
   * When `options.streaming === true`, holds the most recent ~300 chars of the
   * model's response as it streams in. Empty string while idle/non-streaming.
   */
  streamingText: string;
  /** Abort the in-flight streaming request (no-op if non-streaming or no request). */
  cancel: () => void;
  reset: () => void;
}

/**
 * Maximum characters of the streaming buffer to keep in React state for display.
 * The full accumulated string is still passed to parseAndValidate at the end ·
 * this cap only affects the live "Generating…" preview to avoid re-rendering
 * many KB of text on every chunk.
 */
const STREAMING_DISPLAY_TAIL = 300;

interface UseClaudeAnalysisOptions<T> {
  /**
   * Opt in to streaming. When true AND `analysisStreamFn` is provided, the
   * hook routes calls through the streaming function and exposes a live
   * `streamingText` plus a `cancel()` method.
   */
  streaming?: boolean;
  /**
   * The streaming counterpart to `analysisFn` · typically one of the
   * `*Stream` exports from `lib/ai.ts`. Signature is `(...args, onChunk, signal) => Promise<T>`.
   */
  analysisStreamFn?: (...args: unknown[]) => Promise<T>;
}

/**
 * Generic hook for managing AI analysis state.
 * Wraps any async AI function with loading/error/success state management.
 *
 * @param analysisFn - The non-streaming AI function to call (e.g., analyzeAdvisorNote)
 * @param options - Optional streaming configuration. Defaults preserve the
 *   exact pre-streaming behaviour.
 */
export function useClaudeAnalysis<T>(
  analysisFn: (...args: never[]) => Promise<T>,
  options?: UseClaudeAnalysisOptions<T>,
): UseClaudeAnalysisReturn<T> {
  const [result, setResult] = useState<T | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [lastUsage, setLastUsage] = useState<RecordedCall | null>(null);
  // Remember the last analyze() args so rerun() can replay them.
  const lastArgsRef = useRef<unknown[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const streamingEnabled = !!options?.streaming && !!options?.analysisStreamFn;
  const analysisStreamFn = options?.analysisStreamFn;

  const analyze = useCallback(
    async (...args: unknown[]) => {
      lastArgsRef.current = args;
      setStatus('analyzing');
      setError(null);
      setRawResponse(null);
      setResult(null);
      setStreamingText('');
      setLastUsage(null);

      // Abort any prior in-flight streaming call before starting a new one.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      try {
        let data: T;
        if (streamingEnabled && analysisStreamFn) {
          const controller = new AbortController();
          abortRef.current = controller;
          const onChunk = (accumulated: string) => {
            // Truncate to the tail for display only · keeps React re-renders cheap.
            const tail =
              accumulated.length > STREAMING_DISPLAY_TAIL
                ? accumulated.slice(-STREAMING_DISPLAY_TAIL)
                : accumulated;
            setStreamingText(tail);
          };
          data = await analysisStreamFn(...args, onChunk, controller.signal);
        } else {
          data = await (analysisFn as (...args: unknown[]) => Promise<T>)(...args);
        }
        setResult(data);
        setStatus('success');
        // ai.ts called recordUsage(...) inside the analysis; pull the
        // most-recent recorded call from the singleton tracker so the UI can
        // render a per-call usage/cost badge.
        setLastUsage(getLastCall());
      } catch (err) {
        // AbortError from a user-initiated cancel: reset to idle silently so
        // the UI doesn't flash an "Analysis Failed" card for an intentional stop.
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('idle');
          setStreamingText('');
          return;
        }
        const message = err instanceof Error ? err.message : 'Analysis failed';
        setError(message);
        if (err instanceof AiResponseError) {
          setRawResponse(err.rawResponse);
          // Dev-only · the raw response can contain extracted document fields
          // (client PII). Never echo it to the console in a production build.
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.error('[ai] schema validation failed. raw response:', err.rawResponse);
          }
        }
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
    },
    [analysisFn, analysisStreamFn, streamingEnabled],
  );

  const rerun = useCallback(async () => {
    if (!lastArgsRef.current) return;
    skipNextCacheRead();
    await analyze(...lastArgsRef.current);
  }, [analyze]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setResult(null);
    setStatus('idle');
    setError(null);
    setRawResponse(null);
    setStreamingText('');
    setLastUsage(null);
    lastArgsRef.current = null;
  }, []);

  return { analyze, rerun, result, status, error, rawResponse, lastUsage, streamingText, cancel, reset };
}
