import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useLLM } from '@/contexts/LLMContext';
import { PROVIDER_LABELS } from '@/lib/llm-provider';
import { AlertTriangle } from 'lucide-react';
import { ProductTour, shouldAutoStartTour } from '@/components/shared/ProductTour';

export function AppLayout() {
  const { provider, activeProviderId } = useLLM();
  // Demo mode = AI calls are answered by the mock provider: either the visitor
  // never added a key (the default for everyone landing here), or they chose a
  // live provider whose key is missing / the backend is unreachable.
  const usingMockFallback = provider.id === 'mock';
  const missingKeyFor = activeProviderId !== 'mock' ? PROVIDER_LABELS[activeProviderId] : null;

  // Below `lg` the sidebar is an off-canvas drawer toggled from the header.
  // At `lg`+ it's the static rail and this state is inert.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // First visit in this browser opens the walkthrough; the header button replays it.
  const [tourOpen, setTourOpen] = useState(shouldAutoStartTour);

  return (
    // Column layout: header, banner (intrinsic height -- it wraps on phones) and a
    // content row that takes the rest of the viewport and scrolls on its own.
    <div className="h-screen flex flex-col bg-ws-paper">
      <Header
        onMenuClick={() => setSidebarOpen((v) => !v)}
        onTourClick={() => {
          setSidebarOpen(false);
          setTourOpen(true);
        }}
      />
      <ProductTour open={tourOpen} onClose={() => setTourOpen(false)} />
      {usingMockFallback && (
        <div
          data-tour="demo-banner"
          role="status"
          className="flex-none bg-verdict-review-bg border-b border-verdict-review/20 text-verdict-review px-4 sm:px-6 py-2 flex items-center justify-center gap-2 text-sm"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Demo mode</strong> · AI results are simulated (mock)
            {missingKeyFor && <> because there is no valid {missingKeyFor} key</>}.{' '}
            <Link
              to="/settings"
              className="font-medium underline underline-offset-2 hover:text-verdict-need_review-dark"
            >
              Add your API key in Settings
            </Link>{' '}
            to run real AI.
          </span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8 min-w-0"
        >
          <div className="max-w-[1280px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
