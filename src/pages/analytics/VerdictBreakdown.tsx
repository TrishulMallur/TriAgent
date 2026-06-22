import { Card } from '@/components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface VerdictBreakdownProps {
  data: { module: string; pass: number; needsReview: number; fail: number }[];
}

export function VerdictBreakdown({ data }: VerdictBreakdownProps) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ws-dark">Verdict Breakdown</h3>
        <p className="text-xs text-ws-muted">Pass / Review / Fail by module</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="module"
              tick={{ fontSize: 9, fill: '#94A3B8' }}
              tickFormatter={(v: string) => v.replace('Transfer ', '').replace('Exception Resolution', 'Exceptions')}
            />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="pass" name="Pass" fill="#2E7D32" stackId="stack" radius={[0, 0, 0, 0]} />
            <Bar dataKey="needsReview" name="Needs Review" fill="#E65100" stackId="stack" />
            <Bar dataKey="fail" name="Fail" fill="#C62828" stackId="stack" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
