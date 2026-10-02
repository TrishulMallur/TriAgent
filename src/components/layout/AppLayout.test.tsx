import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LLMProviderWrapper, useLLM } from '@/contexts/LLMContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/ui/Toast';
import { TOUR_SEEN_KEY } from '@/components/shared/ProductTour';
import { ApiKeyManager } from '@/pages/settings/ApiKeyManager';
import { AppLayout } from './AppLayout';

let llm: ReturnType<typeof useLLM> | null = null;
function Capture(): ReactNode {
  llm = useLLM();
  return null;
}

function renderApp(page: ReactNode = <p>page</p>) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <LLMProviderWrapper>
          <RoleProvider>
            <Capture />
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={page} />
              </Route>
            </Routes>
          </RoleProvider>
          <ToastContainer />
        </LLMProviderWrapper>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  llm = null;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppLayout first visit', () => {
  it('shows the demo-mode banner and opens the walkthrough', () => {
    renderApp();
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Demo mode');
    expect(banner).toHaveTextContent('AI results are simulated (mock)');
    expect(screen.getByRole('link', { name: 'Add your API key in Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('dialog')).toHaveTextContent('Welcome to TriAgent');
  });

  it('does not reopen the walkthrough once seen, but the header button replays it', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take the quick tour' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Welcome to TriAgent');
  });

  it('hides the banner once a live provider has a real key', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp();
    act(() => {
      llm!.setUseBackend(false);
      llm!.updateConfig({ claude: { apiKey: 'sk-ant-api03-test-0123456789abcdefghij', model: 'claude-sonnet-4-20250514' } });
      llm!.setProvider('claude');
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('names the provider when its key is missing', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    localStorage.setItem('triagent.providers.active', 'claude');
    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('because there is no valid Claude key');
  });
});

describe('ApiKeyManager leaves demo mode', () => {
  const FULL_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

  it('committing a complete key while in demo mode switches to that provider', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    expect(llm!.activeProviderId).toBe('mock');

    const input = screen.getByPlaceholderText('sk-ant-…');
    fireEvent.change(input, { target: { value: FULL_KEY } });
    expect(llm!.activeProviderId).toBe('mock'); // not on the keystroke
    fireEvent.blur(input);
    expect(llm!.activeProviderId).toBe('claude');
    expect(screen.getByText(/Claude key added · live AI is on/)).toBeInTheDocument();
  });

  it('typing a key character by character never switches before it is committed', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    const input = screen.getByPlaceholderText('sk-ant-…');
    for (let i = 1; i <= FULL_KEY.length; i++) {
      fireEvent.change(input, { target: { value: FULL_KEY.slice(0, i) } });
      expect(llm!.activeProviderId).toBe('mock');
    }
    expect(screen.queryByText(/live AI is on/)).toBeNull();
  });

  it('pasting a key switches once, with one toast, even when followed by blur', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    const input = screen.getByPlaceholderText('sk-ant-…') as HTMLInputElement;
    // Browser order: paste event first, then the value lands (input/change).
    fireEvent.paste(input, { clipboardData: { getData: () => 'sk-ant-api03-test-0123456789abcdefghij' } });
    fireEvent.change(input, { target: { value: 'sk-ant-api03-test-0123456789abcdefghij' } });
    expect(llm!.activeProviderId).toBe('mock'); // the paste handler commits on the next tick
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(llm!.activeProviderId).toBe('claude');
    fireEvent.blur(input);
    expect(screen.getAllByText(/Claude key added · live AI is on/)).toHaveLength(1);
  });

  it('Enter commits the key too', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    const input = screen.getByPlaceholderText('sk-ant-…');
    fireEvent.change(input, { target: { value: FULL_KEY } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(llm!.activeProviderId).toBe('claude');
  });

  it('a partial key or a placeholder does not leave demo mode', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    const claude = screen.getByPlaceholderText('sk-ant-…');
    fireEvent.change(claude, { target: { value: 'sk-ant-abc' } });
    fireEvent.blur(claude);
    const gemini = screen.getByPlaceholderText('AIza…');
    fireEvent.change(gemini, { target: { value: 'your_gemini_key_here' } });
    fireEvent.blur(gemini);
    expect(llm!.activeProviderId).toBe('mock');
    // Neither a partial key nor the placeholder is shown as a configured key.
    expect(screen.queryAllByText('key set')).toHaveLength(0);
  });

  it('paste key -> live call through the proxy with the visitor key -> clear -> demo mode again', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes('/api/llm/')) {
        return { ok: true, status: 200, json: async () => ({ content: '{}', usage: { in: 1, out: 1 } }) } as unknown as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<ApiKeyManager />);
    act(() => {
      llm!.setUseBackend(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Demo mode');

    // Paste + commit a complete key: live, via the proxy, with the visitor key.
    const input = screen.getByPlaceholderText('sk-ant-…');
    fireEvent.change(input, { target: { value: 'sk-ant-api03-test-0123456789abcdefghij' } });
    fireEvent.blur(input);
    await waitFor(() => expect(llm!.provider.id).toBe('backend'));
    expect(screen.queryByRole('status')).toBeNull();
    await llm!.provider.analyze('system', 'user', 16);
    const proxy = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/llm/'));
    expect(proxy).toHaveLength(1);
    expect(String(proxy[0][0])).toContain('/api/llm/claude');
    const init = proxy[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-User-API-Key']).toBe('sk-ant-api03-test-0123456789abcdefghij');

    // Clear the key: back to demo mode, banner restored, no further proxy calls.
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(llm!.provider.id).toBe('mock'));
    expect(screen.getByRole('status')).toHaveTextContent('no valid Claude key');
    await llm!.provider.analyze('You are a CIRO compliance auditor.', 'Met with client.', 16);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/llm/'))).toHaveLength(1);
  }, 10_000);

  it('has no standalone Backend key card', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    expect(screen.queryByText('Backend Proxy')).toBeNull();
  });

  it('cloud "Test connection" needs a complete key', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    renderApp(<ApiKeyManager />);
    const claudeInput = screen.getByPlaceholderText('sk-ant-…');
    const claudeCard = claudeInput.closest('div.space-y-3') as HTMLElement;
    const testBtn = () =>
      Array.from(claudeCard.querySelectorAll('button')).find((b) => /Test connection/.test(b.textContent ?? ''))!;
    expect(testBtn()).toBeDisabled();
    fireEvent.change(claudeInput, { target: { value: 'sk-ant-abc' } });
    expect(testBtn()).toBeDisabled();
    fireEvent.change(claudeInput, { target: { value: 'sk-ant-api03-test-0123456789abcdefghij' } });
    expect(testBtn()).not.toBeDisabled();
  });

  it('local "Test connection" pings the local server, never the proxy', async () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<ApiKeyManager />);
    const llamaCard = screen.getByText('llama.cpp').closest('div.space-y-3') as HTMLElement;
    const btn = Array.from(llamaCard.querySelectorAll('button')).find((b) => /Test connection/.test(b.textContent ?? ''))!;
    fireEvent.click(btn);
    await waitFor(() =>
      expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.endsWith('/health'))).toBe(true),
    );
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/api/llm/'))).toBe(false);
  });

  it('does not override a provider the visitor already chose', () => {
    localStorage.setItem(TOUR_SEEN_KEY, '1');
    localStorage.setItem('triagent.providers.active', 'claude');
    renderApp(<ApiKeyManager />);
    const gemini = screen.getByPlaceholderText('AIza…');
    fireEvent.change(gemini, { target: { value: 'AIzaSyA-abcdefghijklmnopqrstuvwxyz012345' } });
    fireEvent.blur(gemini);
    expect(llm!.activeProviderId).toBe('claude');
  });
});
