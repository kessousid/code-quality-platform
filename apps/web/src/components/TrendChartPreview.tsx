import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

const previewData = [
  { scan: 'scan 1', findings: 42 },
  { scan: 'scan 2', findings: 37 },
  { scan: 'scan 3', findings: 29 },
  { scan: 'scan 4', findings: 24 },
];

/**
 * Phase 3 proof that Recharts (time-series/trend views — see
 * docs/adr/0008) works inside this build pipeline. Real scan-history data
 * replaces this fixture in Phase 10.
 */
export function TrendChartPreview() {
  return (
    <div className="h-64 w-full rounded-lg border p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={previewData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="scan" />
          <YAxis />
          <Line type="monotone" dataKey="findings" stroke="#2a78d6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
