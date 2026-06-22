import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useLLM } from '@/contexts/LLMContext';
import { PROVIDER_LABELS } from '@/lib/llm-provider';
import { AlertTriangle } from 'lucide-react';

export function AppLayout() {
  const { provider, activeProviderId } = useLLM();
  // "Mock fallback" = the user asked for a live provider but hasn't given us
  // a key (or the backend proxy is unreachable). Distinguish from the user
  // intentionally using the Mock provider so we don't nag them.
  const usingMockFallback = provider.id === 'mock' && activeProviderId !== 'mock';

  // Below `lg` the sidebar is an off-canvas drawer toggled from the header.
  // At `lg`+ it's the static rail and this state is inert.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ws-paper">
      <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
      {usingMockFallback && (
        <div className="bg-verdict-review-bg border-b border-verdict-review/20 text-verdict-review px-4 sm:px-6 py-2 flex items-center justify-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            No API key for <strong>{PROVIDER_LABELS[activeProviderId]}</strong> · using mock provider.{' '}
            <Link
              to="/settings"
              className="font-medium underline underline-offset-2 hover:text-verdict-need_review-dark"
            >
              Paste a key in Settings
            </Link>{' '}
            to try live AI.
          </span>
        </div>
      )}
      <div className="flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8 min-w-0"
          style={{ height: usingMockFallback ? 'calc(100vh - 3.5rem - 2.25rem)' : 'calc(100vh - 3.5rem)' }}
        >
          <div className="max-w-[1280px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
