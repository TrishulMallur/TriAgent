import { Card, Badge } from '@/components/ui';
import { ShieldAlert } from 'lucide-react';

interface OverridesPanelProps {
  data: { date: string; count: number; reasons: Record<string, number> }[];
}

export function OverridesPanel({ data }: OverridesPanelProps) {
  const totalOverrides = data.reduce((sum, d) => sum + d.count, 0);

  // Aggregate all reasons across dates
  const reasonCounts: Record<string, number> = {};
  for (const entry of data) {
    for (const [reason, count] of Object.entries(entry.reasons)) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + count;
    }
  }

  const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-4 h-4 text-amber-600" />
        <div>
          <h3 className="text-sm font-semibold text-ws-dark">Overrides</h3>
          <p className="text-xs text-ws-muted">{totalOverrides} total in period</p>
        </div>
      </div>

      {/* Per-day counts · scrolls horizontally on narrow screens when many days are shown */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {data.map((entry) => (
          <div key={entry.date} className="flex-1 text-center bg-ws-light rounded-lg p-2">
            <p className="text-lg font-bold text-ws-dark">{entry.count}</p>
            <p className="text-2xs text-ws-muted">{entry.date.slice(5)}</p>
          </div>
        ))}
      </div>

      {/* Reason breakdown */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-ws-muted uppercase tracking-wider">Reasons</h4>
        {sortedReasons.map(([reason, count]) => (
          <div key={reason} className="flex items-center gap-2">
            <Badge variant="warning" size="sm">{count}</Badge>
            <span className="text-xs text-ws-dark truncate">{reason}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
