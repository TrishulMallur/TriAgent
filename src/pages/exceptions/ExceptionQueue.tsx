import { useState, useMemo } from 'react';
import { Card, Badge, Tabs } from '@/components/ui';
import type { TransferException, RejectionType } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { computeSlaStatus, formatSlaCountdown, type SlaState } from '@/lib/sla';
import {
  Search,
  UserX,
  DollarSign,
  RefreshCw,
  PenLine,
  Clock,
  CheckSquare,
  Square,
} from 'lucide-react';

interface ExceptionQueueProps {
  exceptions: TransferException[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  batchSelected: Set<string>;
  onToggleBatch: (id: string) => void;
  onBatchApprove: () => void;
  /** Reference "now" · ticks every 60s from the parent so all cards stay in lockstep. */
  now: Date;
  /** SLA windows in hours by rejection type · from RulesContext.sla.windows_hours. */
  slaWindowsHours: Record<RejectionType, number>;
}

const SLA_BADGE_VARIANT: Record<SlaState, 'success' | 'warning' | 'error' | 'default'> = {
  on_track: 'success',
  approaching: 'warning',
  at_risk: 'error',
  breached: 'error',
};

const SLA_BADGE_LABEL: Record<SlaState, string> = {
  on_track: 'On Track',
  approaching: 'Approaching',
  at_risk: 'At Risk',
  breached: 'Breached',
};

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending_diagnosis', label: 'Pending' },
  { id: 'diagnosed', label: 'Diagnosed' },
  { id: 'email_drafted', label: 'Email Drafted' },
  { id: 'approved', label: 'Approved' },
  { id: 'sent', label: 'Sent' },
  { id: 'escalated', label: 'Escalated' },
];

const REJECTION_ICONS: Record<string, React.ReactNode> = {
  name_mismatch: <UserX className="w-3.5 h-3.5" />,
  insufficient_fee: <DollarSign className="w-3.5 h-3.5" />,
  account_type_conflict: <RefreshCw className="w-3.5 h-3.5" />,
  missing_signature: <PenLine className="w-3.5 h-3.5" />,
  expired_authorization: <Clock className="w-3.5 h-3.5" />,
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  pending_diagnosis: 'warning',
  diagnosed: 'info',
  email_drafted: 'default',
  approved: 'success',
  sent: 'success',
  resolved: 'success',
  escalated: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  pending_diagnosis: 'Pending',
  diagnosed: 'Diagnosed',
  email_drafted: 'Email Drafted',
  approved: 'Approved',
  sent: 'Sent',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export function ExceptionQueue({
  exceptions,
  selectedId,
  onSelect,
  batchSelected,
  onToggleBatch,
  onBatchApprove,
  now,
  slaWindowsHours,
}: ExceptionQueueProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    let list = exceptions;

    if (activeTab !== 'all') {
      list = list.filter((e) => e.status === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.clientName.toLowerCase().includes(q) ||
          e.rejectionCode.toLowerCase().includes(q) ||
          e.sendingInstitution.toLowerCase().includes(q) ||
          e.rejectionReason.toLowerCase().includes(q)
      );
    }

    return list;
  }, [exceptions, activeTab, searchQuery]);

  const tabsWithCounts = STATUS_TABS.map((tab) => ({
    ...tab,
    count: tab.id === 'all' ? exceptions.length : exceptions.filter((e) => e.status === tab.id).length,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-ws-dark">Exception Queue</h2>
          <Badge variant="warning" dot>
            {exceptions.filter((e) => e.status === 'pending_diagnosis').length} pending
          </Badge>
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} size="sm" />

      {/* Search */}
      <div className="relative mt-3 mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ws-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, code, institution..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-ws-border bg-white text-ws-dark placeholder:text-ws-muted/60 focus:outline-none focus:ring-2 focus:ring-ws-accent/50"
        />
      </div>

      {/* Batch actions */}
      {batchSelected.size >= 2 && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-ws-accent/5 border border-ws-accent/20">
          <span className="text-xs font-medium text-ws-accent">
            {batchSelected.size} selected
          </span>
          <button
            onClick={onBatchApprove}
            className="ml-auto text-xs font-semibold text-ws-accent hover:text-ws-accent-dark"
          >
            Batch Approve
          </button>
        </div>
      )}

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto space-y-2 mt-1 pr-1">
        {filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-ws-muted">No exceptions match your filters</p>
          </div>
        )}

        {filtered.map((exc) => {
          const isSelected = selectedId === exc.id;
          const isBatchChecked = batchSelected.has(exc.id);
          const isHighValue = exc.transferAmount > 100000;
          const windowHours = slaWindowsHours[exc.rejectionType] ?? 48;
          const sla = computeSlaStatus(exc.dateRejected, now, windowHours);
          const isResolved =
            exc.status === 'approved' ||
            exc.status === 'sent' ||
            exc.status === 'resolved' ||
            exc.status === 'escalated';

          return (
            <Card
              key={exc.id}
              padding="sm"
              className={`cursor-pointer transition-all ${
                isSelected
                  ? 'border-ws-accent ring-1 ring-ws-accent/30'
                  : 'hover:border-ws-accent/30'
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Batch checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBatch(exc.id);
                  }}
                  className="mt-0.5 text-ws-muted hover:text-ws-accent transition-colors"
                >
                  {isBatchChecked ? (
                    <CheckSquare className="w-4 h-4 text-ws-accent" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                {/* Main content */}
                <div className="flex-1 min-w-0" onClick={() => onSelect(exc.id)}>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-ws-dark truncate">
                        {exc.clientName}
                      </span>
                      {isHighValue && (
                        <Badge variant="error" size="sm">
                          High Value
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isResolved && (
                        <Badge variant={SLA_BADGE_VARIANT[sla.state]} size="sm" dot>
                          {SLA_BADGE_LABEL[sla.state]}
                          {sla.state === 'breached'
                            ? ` ${formatSlaCountdown(sla.remainingMs)}`
                            : ''}
                        </Badge>
                      )}
                      <Badge variant={STATUS_BADGE_VARIANT[exc.status] || 'default'} size="sm" dot>
                        {STATUS_LABELS[exc.status] || exc.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-2xs font-mono text-ws-accent bg-ws-accent/5 px-1.5 py-0.5 rounded">
                      {exc.rejectionCode}
                    </span>
                    <span className="flex items-center gap-1 text-2xs text-ws-muted">
                      {REJECTION_ICONS[exc.rejectionType]}
                      {exc.rejectionType.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-ws-muted line-clamp-2 mb-2">
                    {exc.rejectionReason}
                  </p>

                  <div className="flex items-center justify-between gap-2 flex-wrap text-2xs text-ws-muted">
                    <span>{exc.sendingInstitution}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium text-ws-dark">
                        {formatCurrency(exc.transferAmount)}
                      </span>
                      <span>{formatDate(exc.dateRejected)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
