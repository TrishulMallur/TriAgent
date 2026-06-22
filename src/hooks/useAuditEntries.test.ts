import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// Spy on setActiveProvider so we don't trigger a real provider sync from
// LLMContext during these tests.
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...actual,
    setActiveProvider: vi.fn(),
    setCacheOptions: vi.fn(),
  };
});

import { LLMProviderWrapper } from '@/contexts/LLMContext';
import { useAuditEntries } from './useAuditEntries';
import type { AuditEntry } from '@/types';

// ---------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------
const FALLBACK: AuditEntry[] = [
  {
    id: 'fallback_1',
    timestamp: '2026-02-24T00:00:00Z',
    userId: 'usr_x',
    userName: 'Fallback User',
    userRole: 'ops_agent',
    module: 'transfer_ingestion',
    documentId: 'doc_fallback',
    action: 'approve',
  },
];

const BACKEND_ROWS = [
  {
    id: 'row_1',
    timestamp: '2026-02-24T10:00:00Z',
    user_id: 'usr_001',
    user_name: 'Alex Kim',
    user_role: 'ops_agent',
    module: 'transfer_ingestion',
    document_id: 'doc_real_001',
    action: 'approve',
    ai_verdict: 'pass',
    human_decision: null,
    override_reason: null,
    metadata: '{"latencyMs": 142}',
  },
  {
    id: 'row_2',
    timestamp: '2026-02-24T09:00:00Z',
    user_id: 'usr_002',
    user_name: 'Jordan Lee',
    user_role: 'compliance',
    module: 'advisor_notes',
    document_id: 'doc_real_002',
    action: 'escalate',
    ai_verdict: 'fail',
    human_decision: null,
    override_reason: null,
    metadata: null,
  },
];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(LLMProviderWrapper, null, children);
}

beforeEach(() => {
  // Default: succeed the LLMContext health check so backendReachable stays
  // true and our hook will attempt a real fetch.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as unknown as Response),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useAuditEntries', () => {
  it('returns fallback once backendReachable flips false (no further audit calls)', async () => {
    // Force the LLMContext health check to fail so backendReachable flips false.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    // Silence the LLMContext warn.
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(
      () => useAuditEntries({ fallback: FALLBACK }),
      { wrapper },
    );

    // Wait for LLMContext's health check effect to mark backend unreachable
    // and for our hook to react.
    await waitFor(() => {
      expect(result.current.status).toBe('fallback');
    });
    if (result.current.status !== 'fallback') throw new Error('expected fallback');
    expect(result.current.source).toBe('mock');
    expect(result.current.entries).toBe(FALLBACK);
    expect(result.current.reason).toMatch(/unreachable/i);

    // After the backend is known to be down, our hook must not fire any
    // further /api/audit requests. (It may have fired one optimistic
    // request before the health check completed; that one is aborted.)
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callCountAfterSettle = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/audit'),
    ).length;

    // Give a beat to ensure no late-arriving call sneaks in.
    await new Promise((r) => setTimeout(r, 20));
    const callCountAfterWait = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/audit'),
    ).length;
    expect(callCountAfterWait).toBe(callCountAfterSettle);
  });

  it('happy path: maps snake_case rows to camelCase AuditEntry and goes ready', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/audit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => BACKEND_ROWS,
        } as unknown as Response);
      }
      // health check
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useAuditEntries({ fallback: FALLBACK }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status !== 'ready') throw new Error('expected ready');
    expect(result.current.source).toBe('backend');
    expect(result.current.entries).toHaveLength(2);

    const [first, second] = result.current.entries;
    expect(first).toMatchObject({
      id: 'row_1',
      userId: 'usr_001',
      userName: 'Alex Kim',
      userRole: 'ops_agent',
      documentId: 'doc_real_001',
      aiVerdict: 'pass',
      action: 'approve',
    });
    // JSON metadata string should be parsed.
    expect(first.metadata).toEqual({ latencyMs: 142 });
    // Null metadata should map to undefined.
    expect(second.metadata).toBeUndefined();
    expect(second.userName).toBe('Jordan Lee');
  });

  it('fetch rejection falls back to mock with the error message', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/audit')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useAuditEntries({ fallback: FALLBACK }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('fallback');
    });
    if (result.current.status !== 'fallback') throw new Error('expected fallback');
    expect(result.current.source).toBe('mock');
    expect(result.current.entries).toBe(FALLBACK);
    expect(result.current.reason).toMatch(/Failed to fetch/);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('non-OK 500 response falls back to mock', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/audit')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useAuditEntries({ fallback: FALLBACK }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('fallback');
    });
    if (result.current.status !== 'fallback') throw new Error('expected fallback');
    expect(result.current.reason).toMatch(/500/);
    expect(result.current.entries).toBe(FALLBACK);
  });

  it('appends since, module, and limit query params to the audit URL', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/audit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const since = '2026-02-17T00:00:00.000Z';
    const { result } = renderHook(
      () =>
        useAuditEntries({
          since,
          module: 'transfer_ingestion',
          limit: 250,
          fallback: FALLBACK,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    const auditCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/audit'),
    );
    expect(auditCall).toBeDefined();
    const calledUrl = String(auditCall![0]);
    expect(calledUrl).toContain('since=');
    expect(calledUrl).toContain(encodeURIComponent(since));
    expect(calledUrl).toContain('module=transfer_ingestion');
    expect(calledUrl).toContain('limit=250');
  });

  it('unmounting before fetch resolves does not produce act warnings', async () => {
    // Hold the audit fetch indefinitely so we can unmount mid-flight.
    let resolveAudit: (v: Response) => void = () => {};
    const auditPromise = new Promise<Response>((res) => {
      resolveAudit = res;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/audit')) return auditPromise;
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(
      () => useAuditEntries({ fallback: FALLBACK }),
      { wrapper },
    );

    // Should still be loading (backend reachable, fetch in flight).
    expect(result.current.status).toBe('loading');

    unmount();

    // Now resolve the in-flight request; the hook is unmounted so no state
    // update should happen. Give microtasks a chance to flush.
    resolveAudit({
      ok: true,
      status: 200,
      json: async () => BACKEND_ROWS,
    } as unknown as Response);
    await new Promise((r) => setTimeout(r, 20));

    const actWarnings = errSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((m) => m.includes('not wrapped in act') || m.includes('update on an unmounted'));
    expect(actWarnings).toHaveLength(0);
  });
});
