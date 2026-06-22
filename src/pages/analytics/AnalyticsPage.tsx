import { useState, useMemo } from 'react';
import { MOCK_ANALYTICS } from '@/data/mockData';
import type { AuditEntry } from '@/types';
import { useAuditEntries } from '@/hooks/useAuditEntries';
import { VolumeChart } from './VolumeChart';
import { VerdictBreakdown } from './VerdictBreakdown';
import { ErrorTrends } from './ErrorTrends';
import { PipelineHealth } from './PipelineHealth';
import { PendingQueue } from './PendingQueue';
import { OverridesPanel } from './OverridesPanel';
import { AuditLogTable } from './AuditLogTable';
import { BarChart3, AlertTriangle } from 'lucide-react';

// ============================================================
// Mock audit entries for the audit log panel
// ============================================================
const MOCK_AUDIT_ENTRIES: AuditEntry[] = [
  { id: 'aud_001', timestamp: '2026-02-24T14:32:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_td_001', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_002', timestamp: '2026-02-24T14:35:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_td_001', action: 'approve' },
  { id: 'aud_003', timestamp: '2026-02-24T13:10:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'advisor_notes', documentId: 'note_003', action: 'ai_analysis', aiVerdict: 'fail' },
  { id: 'aud_004', timestamp: '2026-02-24T13:15:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'advisor_notes', documentId: 'note_003', action: 'escalate' },
  { id: 'aud_005', timestamp: '2026-02-24T11:45:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_validation', documentId: 'doc_rbc_002', action: 'ai_analysis', aiVerdict: 'fail' },
  { id: 'aud_006', timestamp: '2026-02-24T11:52:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_validation', documentId: 'doc_rbc_002', action: 'reject' },
  { id: 'aud_007', timestamp: '2026-02-24T10:20:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'transfer_exception', documentId: 'exc_005', action: 'ai_analysis', aiVerdict: 'needs_review' },
  { id: 'aud_008', timestamp: '2026-02-24T10:28:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'transfer_exception', documentId: 'exc_005', action: 'override', aiVerdict: 'needs_review', overrideReason: 'Known client · context not in system' },
  { id: 'aud_009', timestamp: '2026-02-24T10:30:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'transfer_exception', documentId: 'exc_005', action: 'send_email' },
  { id: 'aud_010', timestamp: '2026-02-23T16:05:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_qs_003', action: 'ai_analysis', aiVerdict: 'needs_review' },
  { id: 'aud_011', timestamp: '2026-02-23T16:12:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_qs_003', action: 'approve' },
  { id: 'aud_012', timestamp: '2026-02-23T15:00:00Z', userId: 'usr_005', userName: 'Morgan Chen', userRole: 'advisor', module: 'advisor_notes', documentId: 'note_007', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_013', timestamp: '2026-02-23T15:02:00Z', userId: 'usr_005', userName: 'Morgan Chen', userRole: 'advisor', module: 'advisor_notes', documentId: 'note_007', action: 'approve' },
  { id: 'aud_014', timestamp: '2026-02-23T09:30:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_exception', documentId: 'exc_002', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_015', timestamp: '2026-02-23T09:38:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_exception', documentId: 'exc_002', action: 'approve' },
  { id: 'aud_016', timestamp: '2026-02-22T14:00:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'transfer_validation', documentId: 'doc_td_004', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_017', timestamp: '2026-02-22T14:05:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'transfer_validation', documentId: 'doc_td_004', action: 'approve' },
  { id: 'aud_018', timestamp: '2026-02-22T11:20:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'advisor_notes', documentId: 'note_012', action: 'ai_analysis', aiVerdict: 'fail' },
  { id: 'aud_019', timestamp: '2026-02-22T11:25:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'advisor_notes', documentId: 'note_012', action: 'override', overrideReason: 'Policy exception approved by supervisor' },
  { id: 'aud_020', timestamp: '2026-02-22T10:00:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_bmo_005', action: 'ai_analysis', aiVerdict: 'pass' },
  // Older entries (outside 7d window) to make time-range filtering visible
  { id: 'aud_021', timestamp: '2026-02-19T13:40:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'advisor_notes', documentId: 'note_018', action: 'ai_analysis', aiVerdict: 'needs_review' },
  { id: 'aud_022', timestamp: '2026-02-18T09:15:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_validation', documentId: 'doc_cibc_009', action: 'approve' },
  { id: 'aud_023', timestamp: '2026-02-15T11:30:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_qs_011', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_024', timestamp: '2026-02-13T14:50:00Z', userId: 'usr_004', userName: 'Taylor Singh', userRole: 'manager', module: 'transfer_exception', documentId: 'exc_009', action: 'override', overrideReason: 'Known client · context not in system' },
  { id: 'aud_025', timestamp: '2026-02-10T10:05:00Z', userId: 'usr_005', userName: 'Morgan Chen', userRole: 'advisor', module: 'advisor_notes', documentId: 'note_021', action: 'ai_analysis', aiVerdict: 'pass' },
  { id: 'aud_026', timestamp: '2026-02-05T15:20:00Z', userId: 'usr_002', userName: 'Jordan Lee', userRole: 'compliance', module: 'transfer_validation', documentId: 'doc_td_014', action: 'reject' },
  { id: 'aud_027', timestamp: '2026-02-02T09:45:00Z', userId: 'usr_001', userName: 'Alex Kim', userRole: 'ops_agent', module: 'transfer_ingestion', documentId: 'doc_rbc_016', action: 'approve' },
  { id: 'aud_028', timestamp: '2026-01-29T13:10:00Z', userId: 'usr_003', userName: 'Sam Patel', userRole: 'ops_agent', module: 'transfer_exception', documentId: 'exc_013', action: 'ai_analysis', aiVerdict: 'fail' },
];

type TimeRange = '7' | '14' | '30';

// Reference "now" used by generateAnalyticsData() · keep in sync with mockData.ts seed.
const REFERENCE_DATE = new Date('2026-02-24');

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30');

  const days = Number(timeRange);
  const ratio = days / 30;

  const filteredVolume = useMemo(
    () => MOCK_ANALYTICS.volumeByDay.slice(-days),
    [days]
  );

  // Scale cumulative module verdict counts by range/30
  const filteredVerdictBreakdown = useMemo(
    () => MOCK_ANALYTICS.verdictBreakdown.map((m) => ({
      module: m.module,
      pass: Math.round(m.pass * ratio),
      needsReview: Math.round(m.needsReview * ratio),
      fail: Math.round(m.fail * ratio),
    })),
    [ratio]
  );

  // Scale cumulative error counts by range/30, preserve count-ordering
  const filteredCommonErrors = useMemo(
    () => MOCK_ANALYTICS.commonErrors
      .map((e) => ({ ...e, count: Math.round(e.count * ratio) }))
      .sort((a, b) => b.count - a.count),
    [ratio]
  );

  // Pipeline health queue depths are a current snapshot · don't scale.
  const pipelineHealth = MOCK_ANALYTICS.pipelineHealth;

  // Overrides: filter to entries within last `days` days from REFERENCE_DATE
  const filteredOverrides = useMemo(() => {
    const cutoff = new Date(REFERENCE_DATE);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    return MOCK_ANALYTICS.overrides.filter((o) => new Date(o.date) >= cutoff);
  }, [days]);

  // Audit log: fetched from the FastAPI backend (filtered server-side via
  // `since=`). Falls back to MOCK_AUDIT_ENTRIES when the backend is
  // unreachable so the demo dashboard still renders something sensible.
  // Note: only the audit table is backend-driven; verdictBreakdown,
  // commonErrors, pipelineHealth, and overrides continue to come from
  // MOCK_ANALYTICS (scaled by the time-range selector) · they are summary
  // aggregates that aren't yet wired to the backend.
  const cutoffIso = useMemo(() => {
    const cutoff = new Date(REFERENCE_DATE);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    return cutoff.toISOString();
  }, [days]);

  const auditState = useAuditEntries({
    since: cutoffIso,
    limit: 500,
    fallback: MOCK_AUDIT_ENTRIES,
  });

  // For mock fallback, apply the same client-side cutoff so the time-range
  // selector still affects the displayed rows.
  const filteredAuditEntries = useMemo(() => {
    if (auditState.status === 'ready') return auditState.entries;
    if (auditState.status === 'fallback') {
      const cutoff = new Date(cutoffIso);
      return auditState.entries.filter((e) => new Date(e.timestamp) >= cutoff);
    }
    return [] as AuditEntry[];
  }, [auditState, cutoffIso]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-ws-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-ws-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ws-dark">Analytics Command Centre</h1>
            <p className="text-sm text-ws-muted">Platform-wide performance and compliance metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-ws-light rounded-lg p-1">
          {(['7', '14', '30'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeRange === range
                  ? 'bg-white text-ws-accent shadow-ws'
                  : 'text-ws-muted hover:text-ws-dark'
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Volume Chart (2/3) + Pending Queue (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <VolumeChart data={filteredVolume} />
        </div>
        <div>
          <PendingQueue data={pipelineHealth} />
        </div>
      </div>

      {/* Row 2: Verdict Breakdown (1/3) + Pipeline Health (1/3) + Error Trends (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <VerdictBreakdown data={filteredVerdictBreakdown} />
        <PipelineHealth data={pipelineHealth} />
        <ErrorTrends data={filteredCommonErrors} />
      </div>

      {/* Row 3: Audit Log (2/3) + Overrides (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {auditState.status === 'fallback' && (
            <div
              className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"
              role="status"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-900">
                  Showing demo data · backend unreachable
                </p>
                <p className="text-2xs text-amber-700 truncate">{auditState.reason}</p>
              </div>
            </div>
          )}
          {auditState.status === 'loading' && (
            <p className="text-xs text-ws-muted px-1">Loading audit log…</p>
          )}
          <AuditLogTable entries={filteredAuditEntries} />
        </div>
        <div>
          <OverridesPanel data={filteredOverrides} />
        </div>
      </div>
    </div>
  );
}
