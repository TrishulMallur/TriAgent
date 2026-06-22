import { Card } from '@/components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface PipelineHealthProps {
  data: { stage: string; count: number; avgTimeMinutes: number }[];
}

const STAGE_COLORS: Record<string, string> = {
  'Ingestion Queue': '#4A90D9',
  'Validation Queue': '#2E7D32',
  'Processing': '#E65100',
  'Exception Queue': '#C62828',
  'Completed (24h)': '#94A3B8',
};

export function PipelineHealth({ data }: PipelineHealthProps) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ws-dark">Pipeline Health</h3>
        <p className="text-xs text-ws-muted">Queue depths &amp; avg. processing time</p>
        <p className="text-2xs text-ws-muted mt-0.5">Current snapshot · not affected by date range</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <YAxis
              type="category"
              dataKey="stage"
              tick={{ fontSize: 9, fill: '#94A3B8' }}
              width={100}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              formatter={(value: number, _name: string, props) => {
                const avg = (props?.payload as { avgTimeMinutes?: number } | undefined)?.avgTimeMinutes ?? 0;
                return [`${value} items (avg ${avg} min)`, 'Queue'];
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] || '#94A3B8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
