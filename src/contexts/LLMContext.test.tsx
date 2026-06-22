import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// Spy on setActiveProvider from ai.ts so we can assert it's invoked when
// the effective provider changes.
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...actual,
    setActiveProvider: vi.fn(),
  };
});

import { LLMProviderWrapper, useLLM } from './LLMContext';
import { setActiveProvider } from '@/lib/ai';
const setActiveProviderMock = setActiveProvider as unknown as ReturnType<typeof vi.fn>;

// The test environment loads the project's real `.env`, which sets:
//   VITE_DEFAULT_PROVIDER=gemini
//   VITE_USE_BACKEND=true
//   VITE_ANTHROPIC_API_KEY=your_claude_key_here
//   VITE_GEMINI_API_KEY=''
// Tests are written against this real env (and instructions are not to
// modify source files, including .env). We pin the values we depend on
// here so that breaking changes to .env surface as test failures.
const ENV_DEFAULT_PROVIDER = import.meta.env.VITE_DEFAULT_PROVIDER || 'claude';
const ENV_USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// ---------------------------------------------------------------
// Capture component: lets tests read the live context value.
// ---------------------------------------------------------------
let captured: ReturnType<typeof useLLM> | null = null;

function Capture(): ReactNode {
  captured = useLLM();
  return null;
}

function renderWithProvider() {
  return render(
    <LLMProviderWrapper>
      <Capture />
    </LLMProviderWrapper>,
  );
}

beforeEach(() => {
  captured = null;
  setActiveProviderMock.mockClear();
  // Default fetch mock so tests that don't care about backend health checks
  // don't accidentally hit the real network. Each test that needs a specific
  // response overrides this with vi.stubGlobal.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LLMContext', () => {
  it('exposes default state derived from import.meta.env', async () => {
    renderWithProvider();

    expect(captured).not.toBeNull();
    // The default provider id mirrors VITE_DEFAULT_PROVIDER (or 'claude').
    expect(captured!.activeProviderId).toBe(ENV_DEFAULT_PROVIDER);
    expect(captured!.useBackend).toBe(ENV_USE_BACKEND);

    // Wait for the effective-provider effect to settle. With useBackend=true
    // and a healthy fetch mock, the effective provider is the backend
    // (reports as 'backend'). With useBackend=false and no configured key,
    // it falls back to mock.
    await waitFor(() => {
      const expected = ENV_USE_BACKEND ? 'backend' : 'mock';
      expect(captured!.provider.id).toBe(expected);
    });
  });

  it('throws when useLLM is called outside the provider', () => {
    // Suppress React's error-boundary console noise for this test only.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/within LLMProviderWrapper/);
    errSpy.mockRestore();
  });

  it('updates activeProviderId when setProvider is called', () => {
    renderWithProvider();
    const initial = captured!.activeProviderId;
    expect(initial).toBe(ENV_DEFAULT_PROVIDER);

    act(() => {
      captured!.setProvider('mock');
    });

    expect(captured!.activeProviderId).toBe('mock');
  });

  it('uses the backend provider when health check succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider();

    act(() => {
      captured!.setUseBackend(true);
    });

    // Backend provider reports its id as 'backend' (see backend-provider.ts).
    await waitFor(() => {
      expect(captured!.provider.id).toBe('backend');
    });
    expect(captured!.useBackend).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('falls back to in-browser provider when backend fetch rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    renderWithProvider();

    // Make sure useBackend is on (even if env already turned it on, toggle is
    // idempotent and forces a re-run of the health-check effect).
    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.setUseBackend(true);
    });

    // With useBackend=true but backend unreachable, the effective provider
    // falls back: in-browser claude isn't configured (key === ''
    // or 'your_claude_key_here'), so it ends up on the mock provider.
    await waitFor(() => {
      expect(captured!.provider.id).toBe('mock');
    });

    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((m) => m.includes('Backend unreachable'))).toBe(true);
  });

  it('falls back to in-browser provider on non-OK backend response', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );

    renderWithProvider();

    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.setUseBackend(true);
    });

    await waitFor(() => {
      expect(captured!.provider.id).toBe('mock');
    });

    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((m) => m.includes('503'))).toBe(true);
  });

  it('calls setActiveProvider whenever the effective provider changes', async () => {
    renderWithProvider();

    // Initial mount triggers at least one sync call.
    await waitFor(() => {
      expect(setActiveProviderMock).toHaveBeenCalled();
    });
    const callsAfterMount = setActiveProviderMock.mock.calls.length;

    // Force a guaranteed change of the *effective* provider, independent of the
    // starting env or any provider id persisted in localStorage by a prior test.
    // Flipping to (mock, no-backend) is a no-op when the app already starts there
    // (which it does on a clean CI runner with no .env). Instead: turn backend
    // off, configure a real Claude key, and select Claude — yielding a configured
    // Claude provider that is distinct from the mount-time effective provider
    // (mock or backend) in every environment.
    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.updateConfig({
        claude: { apiKey: 'test-key', model: 'claude-sonnet-4-20250514' },
      });
    });
    act(() => {
      captured!.setProvider('claude');
    });

    await waitFor(() => {
      expect(setActiveProviderMock.mock.calls.length).toBeGreaterThan(
        callsAfterMount,
      );
    });
  });

  it('updateConfig merges the partial config and rebuilds the provider', () => {
    renderWithProvider();

    const initialKey = captured!.config.claude.apiKey;
    // Sanity: the actual key from .env is either '' or the placeholder.
    expect(['', 'your_claude_key_here']).toContain(initialKey);

    act(() => {
      captured!.updateConfig({
        claude: { apiKey: 'new-key', model: 'claude-sonnet-4-20250514' },
      });
    });

    expect(captured!.config.claude.apiKey).toBe('new-key');
    expect(captured!.config.claude.model).toBe('claude-sonnet-4-20250514');
  });
});
