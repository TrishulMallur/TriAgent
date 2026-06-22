import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RoleProvider } from '@/contexts/RoleContext';
import { LLMProviderWrapper } from '@/contexts/LLMContext';
import { RulesProvider, useRules } from '@/contexts/RulesContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ToastContainer } from '@/components/ui/Toast';
import { setActiveRules } from '@/lib/ai';
import {
  DashboardPage,
  TransferOverviewPage,
  IngestionPage,
  ValidationPage,
  ExceptionsPage,
  AdvisorNotesPage,
  AnalyticsPage,
  SettingsPage,
} from '@/pages';

/**
 * Bridge: pushes the current Rules state into the `ai.ts` singleton on every
 * change so prompt builders see the latest active rules. Lives inside
 * `<RulesProvider>` so it can read the context, and outside `ai.ts` itself
 * to avoid a circular import (ai.ts already imports renderRulesPreamble
 * from RulesContext).
 */
function RulesSync() {
  const { rules } = useRules();
  useEffect(() => {
    setActiveRules(rules);
  }, [rules]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <LLMProviderWrapper>
          <RulesProvider>
            <RulesSync />
            <RoleProvider>
              <Routes>
                <Route element={<AppLayout />}>
                  {/* Dashboard */}
                  <Route path="/" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />

                  {/* Transfer Pipeline */}
                  <Route path="/transfer" element={<ErrorBoundary><TransferOverviewPage /></ErrorBoundary>} />
                  <Route path="/transfer/ingestion" element={<ErrorBoundary><IngestionPage /></ErrorBoundary>} />
                  <Route path="/transfer/validation" element={<ErrorBoundary><ValidationPage /></ErrorBoundary>} />
                  <Route path="/transfer/exceptions" element={<ErrorBoundary><ExceptionsPage /></ErrorBoundary>} />

                  {/* Advisor Notes */}
                  <Route path="/advisor-notes" element={<ErrorBoundary><AdvisorNotesPage /></ErrorBoundary>} />

                  {/* Analytics */}
                  <Route path="/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />

                  {/* Settings */}
                  <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />

                  {/* Catch-all */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
              <ToastContainer />
            </RoleProvider>
          </RulesProvider>
        </LLMProviderWrapper>
      </ToastProvider>
    </BrowserRouter>
  );
}
