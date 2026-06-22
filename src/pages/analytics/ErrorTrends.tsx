import { Card, Badge } from '@/components/ui';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ErrorTrendsProps {
  data: { error: string; count: number; module: string; trend: 'up' | 'down' | 'stable' }[];
}

const TREND_ICON = {
  up: <TrendingUp className="w-3.5 h-3.5 text-red-600" />,
  down: <TrendingDown className="w-3.5 h-3.5 text-green-600" />,
  stable: <Minus className="w-3.5 h-3.5 text-ws-muted" />,
};

const TREND_LABEL: Record<string, string> = { up: 'Rising', down: 'Declining', stable: 'Stable' };

export function ErrorTrends({ data }: ErrorTrendsProps) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ws-dark">Common Errors</h3>
        <p className="text-xs text-ws-muted">Top rejection reasons in selected period</p>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {data.map((item) => (
          <div key={item.error} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-ws-light transition-colors">
            <span className="text-sm font-semibold text-ws-dark w-8 text-right">{item.count}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ws-dark truncate">{item.error}</p>
              <Badge variant={item.module === 'Transfer' ? 'info' : 'warning'} size="sm">{item.module}</Badge>
            </div>
            <span className="flex items-center gap-1 text-2xs flex-shrink-0" title={TREND_LABEL[item.trend]}>
              {TREND_ICON[item.trend]}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
