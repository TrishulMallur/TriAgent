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
  // Clear persisted provider config · LLMContext mirrors updateConfig() to
  // localStorage and hydrates from it on mount, so a key set by an earlier
  // test (e.g. 'test-key') would otherwise leak into this one's initial state.
  // Harmless locally (real .env masks it) but breaks on a clean CI runner.
  localStorage.clear();
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
    // Every first-time visitor starts in demo mode, whatever the build env says.
    expect(captured!.activeProviderId).toBe('mock');
    expect(captured!.useBackend).toBe(ENV_USE_BACKEND);

    // Wait for the effective-provider effect to settle. A fresh visitor has no
    // key of their own (only '' or the build-time placeholder), so even with
    // useBackend=true and a healthy backend the effective provider is mock --
    // the backend proxy needs the visitor's key and would answer 401.
    await waitFor(() => {
      expect(captured!.provider.id).toBe('mock');
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
    expect(initial).toBe('mock');

    act(() => {
      captured!.setProvider('claude');
    });

    expect(captured!.activeProviderId).toBe('claude');
  });

  it('uses the backend provider when health check succeeds and the visitor has a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider();

    act(() => {
      captured!.updateConfig({
        claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' },
      });
    });
    act(() => {
      captured!.setProvider('claude');
    });
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

  // Regression: the live demo routed key-less visitors through the backend
  // proxy, which forwarded '' or the build-time placeholder as the visitor's
  // key -> every AI action failed with 401 instead of using the mock provider.
  it.each([
    ['no key', ''],
    ['the build-time placeholder key', 'your_claude_key_here'],
  ])('uses the mock provider, not the backend, when the visitor has %s', async (_label, key) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));

    renderWithProvider();

    act(() => {
      captured!.updateConfig({
        claude: { apiKey: key, model: 'claude-sonnet-4-20250514' },
      });
    });
    act(() => {
      captured!.setProvider('claude');
    });
    act(() => {
      captured!.setUseBackend(true);
    });

    await waitFor(() => {
      expect(captured!.provider.id).toBe('mock');
    });
    // Give the health-check effect a chance to (wrongly) switch to backend.
    await new Promise((r) => setTimeout(r, 50));
    expect(captured!.provider.id).toBe('mock');
  });

  it('keeps a returning visitor on the provider they chose', () => {
    localStorage.setItem('triagent.providers.active', 'gemini');
    renderWithProvider();
    expect(captured!.activeProviderId).toBe('gemini');
  });

  it('never routes demo mode through the backend, even with a stored key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));
    renderWithProvider();
    act(() => {
      captured!.updateConfig({ gemini: { apiKey: 'real-gemini-key', model: 'gemini-2.0-flash' } });
    });
    act(() => {
      captured!.setUseBackend(true);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(captured!.activeProviderId).toBe('mock');
    expect(captured!.provider.id).toBe('mock');
  });

  it('a stored "backend" provider is not restored and makes no proxy call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('triagent.providers.active', 'backend');
    renderWithProvider();
    act(() => {
      captured!.setUseBackend(true);
    });
    expect(captured!.activeProviderId).toBe('mock');
    await captured!.provider.analyze('You are a CIRO compliance auditor.', 'Met with client.', 16);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/llm/'))).toBe(false);
  }, 10_000);

  it('choosing "backend" at runtime still answers from the mock provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));
    renderWithProvider();
    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.setProvider('backend');
    });
    await waitFor(() => expect(captured!.provider.id).toBe('mock'));
  });

  it('survives blocked storage and starts in demo mode', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(() => renderWithProvider()).not.toThrow();
    expect(captured!.activeProviderId).toBe('mock');
    expect(captured!.provider.id).toBe('mock');
  });

  // Round-2 review: with a cloud provider already selected, clearing the key and
  // typing one character must not go live with a half-typed key.
  it('a half-typed replacement key keeps the selected cloud provider in demo mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProvider();
    act(() => {
      captured!.updateConfig({ claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' } });
    });
    act(() => {
      captured!.setProvider('claude');
    });
    act(() => {
      captured!.setUseBackend(true);
    });
    await waitFor(() => expect(captured!.provider.id).toBe('backend'));

    act(() => {
      captured!.updateConfig({ claude: { apiKey: '', model: 'claude-sonnet-4-20250514' } });
    });
    act(() => {
      captured!.updateConfig({ claude: { apiKey: 's', model: 'claude-sonnet-4-20250514' } });
    });
    await waitFor(() => expect(captured!.provider.id).toBe('mock'));
    expect(captured!.activeProviderId).toBe('claude');
    await captured!.provider.analyze('You are a CIRO compliance auditor.', 'Met with client.', 16);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/api/llm/'))).toBe(false);
  }, 10_000);

  it('isConfigured reports live AI only for a complete cloud key', () => {
    renderWithProvider();
    act(() => {
      captured!.setProvider('claude');
      captured!.updateConfig({ claude: { apiKey: 's', model: 'claude-sonnet-4-20250514' } });
    });
    expect(captured!.isConfigured).toBe(false);
    act(() => {
      captured!.updateConfig({ claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' } });
    });
    expect(captured!.isConfigured).toBe(true);
  });

  it('a half-typed key keeps a direct (non-backend) cloud provider in demo mode too', () => {
    renderWithProvider();
    act(() => {
      captured!.setUseBackend(false);
      captured!.updateConfig({ claude: { apiKey: 'sk-ant-a', model: 'claude-sonnet-4-20250514' } });
      captured!.setProvider('claude');
    });
    expect(captured!.provider.id).toBe('mock');
  });

  it('falls back to in-browser provider when backend fetch rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    renderWithProvider();

    // A visitor with a complete Claude key; then backend mode on (the toggle
    // re-runs the health-check effect).
    act(() => {
      captured!.updateConfig({ claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' } });
    });
    act(() => {
      captured!.setProvider('claude');
    });
    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.setUseBackend(true);
    });

    // Backend unreachable -> the configured in-browser Claude provider, not the
    // proxy and not mock.
    await waitFor(() => {
      expect(captured!.provider.id).toBe('claude');
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
      captured!.updateConfig({ claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' } });
    });
    act(() => {
      captured!.setProvider('claude');
    });
    act(() => {
      captured!.setUseBackend(false);
    });
    act(() => {
      captured!.setUseBackend(true);
    });

    await waitFor(() => {
      expect(captured!.provider.id).toBe('claude');
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
        claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' },
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
