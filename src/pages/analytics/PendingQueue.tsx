import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Card, Badge } from '@/components/ui';
import { Clock, AlertTriangle } from 'lucide-react';
import { MOCK_EXCEPTIONS } from '@/data/mockData';
import { useRules } from '@/contexts/RulesContext';
import { computeSlaStatus, type SlaState } from '@/lib/sla';

interface PendingQueueProps {
  data: { stage: string; count: number; avgTimeMinutes: number }[];
}

const SLA_ORDER: SlaState[] = ['breached', 'at_risk', 'approaching', 'on_track'];
const SLA_LABEL: Record<SlaState, string> = {
  on_track: 'On Track',
  approaching: 'Approaching',
  at_risk: 'At Risk',
  breached: 'Breached',
};
const SLA_VARIANT: Record<SlaState, 'success' | 'warning' | 'error'> = {
  on_track: 'success',
  approaching: 'warning',
  at_risk: 'error',
  breached: 'error',
};

function getSlaStatus(avgMinutes: number): { variant: 'success' | 'warning' | 'error'; label: string } {
  if (avgMinutes === 0) return { variant: 'success', label: 'Clear' };
  if (avgMinutes < 30) return { variant: 'success', label: 'On Track' };
  if (avgMinutes < 60) return { variant: 'warning', label: 'Approaching' };
  return { variant: 'error', label: 'At Risk' };
}

export function PendingQueue({ data }: PendingQueueProps) {
  const activeQueues = data.filter((d) => d.stage !== 'Completed (24h)');
  const completed = data.find((d) => d.stage === 'Completed (24h)');
  const totalPending = activeQueues.reduce((sum, d) => sum + d.count, 0);

  // Live SLA breakdown across all currently-unresolved exceptions. Re-evaluated
  // every 60s so badges roll over naturally without manual refresh.
  const { rules } = useRules();
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const slaBreakdown = useMemo(() => {
    const counts: Record<SlaState, number> = {
      on_track: 0,
      approaching: 0,
      at_risk: 0,
      breached: 0,
    };
    for (const exc of MOCK_EXCEPTIONS) {
      // Skip exceptions already resolved/sent/escalated · the SLA clock is irrelevant.
      if (
        exc.status === 'approved' ||
        exc.status === 'sent' ||
        exc.status === 'resolved' ||
        exc.status === 'escalated'
      ) {
        continue;
      }
      const windowHours = rules.sla.windows_hours[exc.rejectionType] ?? 48;
      const status = computeSlaStatus(exc.dateRejected, now, windowHours);
      counts[status.state]++;
    }
    return counts;
  }, [now, rules.sla.windows_hours]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ws-dark">Pending Queue</h3>
          <p className="text-xs text-ws-muted">{totalPending} items across all stages</p>
          <p className="text-2xs text-ws-muted mt-0.5">Current snapshot · not affected by date range</p>
        </div>
        {completed && (
          <Badge variant="success" size="sm" dot>{completed.count} done (24h)</Badge>
        )}
      </div>
      <div className="space-y-3">
        {activeQueues.map((item) => {
          const sla = getSlaStatus(item.avgTimeMinutes);
          return (
            <div key={item.stage} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-ws-dark truncate">{item.stage}</span>
                  <span className="text-lg font-bold text-ws-dark">{item.count}</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-ws-muted">
                  <Clock className="w-3 h-3" />
                  <span>Avg {item.avgTimeMinutes} min</span>
                  <Badge variant={sla.variant} size="sm">{sla.label}</Badge>
                  {sla.variant === 'error' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live SLA breakdown · single hairline-divided strip, no nested cards. */}
      <div className="mt-5 pt-4 border-t border-ws-border">
        <p className="eyebrow mb-3">Exception SLA (live)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-ws-border">
          {SLA_ORDER.map((state, i) => {
            const dotColor =
              SLA_VARIANT[state] === 'success' ? 'bg-verdict-pass' :
              SLA_VARIANT[state] === 'warning' ? 'bg-verdict-review' :
              'bg-verdict-fail';
            return (
              <div
                key={state}
                className={clsx(
                  'flex flex-col gap-1.5',
                  i === 0 ? 'sm:pr-3' : i === SLA_ORDER.length - 1 ? 'sm:pl-3' : 'sm:px-3'
                )}
              >
                <span className="text-xl font-semibold tracking-tightest tabular-nums text-ws-black leading-none">
                  {slaBreakdown[state]}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ws-muted whitespace-nowrap">
                  <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
                  {SLA_LABEL[state]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
