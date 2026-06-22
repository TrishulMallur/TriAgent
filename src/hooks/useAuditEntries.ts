import { useEffect, useState } from 'react';
import { useLLM } from '@/contexts/LLMContext';
import type { AuditEntry, UserRole, Verdict } from '@/types';

/**
 * State machine returned by {@link useAuditEntries}.
 *
 * - `loading`  · initial state while the backend fetch is in flight.
 * - `ready`    · the backend responded and we have real audit rows.
 * - `fallback` · the backend is unreachable (or returned an error). The
 *                caller-supplied `fallback` array is used so the UI still
 *                renders something useful, and `reason` explains why.
 */
export type AuditEntriesState =
  | { status: 'loading' }
  | { status: 'ready'; entries: AuditEntry[]; source: 'backend' }
  | { status: 'fallback'; entries: AuditEntry[]; source: 'mock'; reason: string };

interface UseAuditEntriesOpts {
  /** ISO-8601 timestamp; only entries at or after this point are returned. */
  since?: string;
  /** Optional module filter (server-side). */
  module?: string;
  /** Hard cap on rows returned. Default 500. */
  limit?: number;
  /** Inline mock fallback used when the backend is unreachable / errors. */
  fallback: AuditEntry[];
}

// Raw row shape coming back from FastAPI (snake_case + JSON metadata string).
interface BackendAuditRow {
  id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  user_role: string;
  module: string;
  document_id: string;
  action: string;
  ai_verdict?: string | null;
  human_decision?: string | null;
  override_reason?: string | null;
  override_verdict?: string | null;
  metadata?: string | Record<string, unknown> | null;
}

function mapRow(row: BackendAuditRow): AuditEntry {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    if (typeof row.metadata === 'string') {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = undefined;
      }
    } else {
      metadata = row.metadata;
    }
  }

  return {
    id: row.id,
    timestamp: row.timestamp,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role as UserRole,
    module: row.module as AuditEntry['module'],
    documentId: row.document_id,
    action: row.action as AuditEntry['action'],
    aiVerdict: (row.ai_verdict || undefined) as Verdict | undefined,
    humanDecision: row.human_decision || undefined,
    overrideReason: row.override_reason || undefined,
    metadata,
  };
}

/**
 * Read audit-log entries from the FastAPI backend, with graceful fallback to a
 * caller-supplied mock array when the backend is unreachable.
 *
 * The hook only fires a network request when `backendReachable` from
 * `useLLM()` is true. If the backend is known to be down, it returns the
 * fallback synchronously on first render · no request, no flash of empty
 * data.
 */
export function useAuditEntries(opts: UseAuditEntriesOpts): AuditEntriesState {
  const { since, module, limit = 500, fallback } = opts;
  const { backendReachable } = useLLM();

  // Re-read the env var locally rather than refactoring LLMContext to
  // expose it. This is the same expression used inside LLMContext.
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const [state, setState] = useState<AuditEntriesState>(() =>
    backendReachable
      ? { status: 'loading' }
      : { status: 'fallback', entries: fallback, source: 'mock', reason: 'Backend unreachable' },
  );

  useEffect(() => {
    // Short-circuit: backend already known to be down. Return fallback without
    // firing a request. Keep `fallback` out of the dep array so callers can
    // pass a fresh array each render without us re-running.
    if (!backendReachable) {
      setState({
        status: 'fallback',
        entries: fallback,
        source: 'mock',
        reason: 'Backend unreachable',
      });
      return;
    }

    setState({ status: 'loading' });
    const controller = new AbortController();
    // 5s upper bound · abort either via unmount or timeout.
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams();
        if (since) params.set('since', since);
        if (module) params.set('module', module);
        params.set('limit', String(limit));
        const url = `${baseUrl}/api/audit?${params.toString()}`;

        const resp = await fetch(url, { signal: controller.signal });
        if (cancelled) return;
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const rows = (await resp.json()) as BackendAuditRow[];
        if (cancelled) return;
        const entries = Array.isArray(rows) ? rows.map(mapRow) : [];
        setState({ status: 'ready', entries, source: 'backend' });
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : String(err);
        console.warn('[useAuditEntries] backend fetch failed, using fallback:', reason);
        setState({
          status: 'fallback',
          entries: fallback,
          source: 'mock',
          reason,
        });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
    // Intentionally omit `fallback` · it's a stable reference in normal use
    // but callers may inline-construct it; treating it as a dep would re-fetch
    // on every render. The fallback is only consulted in the error branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendReachable, since, module, limit, baseUrl]);

  return state;
}
