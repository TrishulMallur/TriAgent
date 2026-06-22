import { Card } from '@/components/ui';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface VolumeChartProps {
  data: { date: string; ingestion: number; validation: number; exception: number; notes: number }[];
}

const LINES = [
  { key: 'ingestion', name: 'Ingestion', color: '#4A90D9' },
  { key: 'validation', name: 'Validation', color: '#2E7D32' },
  { key: 'exception', name: 'Exceptions', color: '#C62828' },
  { key: 'notes', name: 'Advisor Notes', color: '#E65100' },
] as const;

export function VolumeChart({ data }: VolumeChartProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ws-dark">Daily Volume</h3>
          <p className="text-xs text-ws-muted">Documents processed per day by module</p>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              labelFormatter={(label: string) => `Date: ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {LINES.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
