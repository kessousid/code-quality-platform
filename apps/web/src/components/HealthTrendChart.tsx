import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { RepoTrendPoint } from '../api/hooks.js';

/** Replaces the Phase 3 preview fixture with real per-scan health scores (Phase 10). */
export function HealthTrendChart({ points }: { points: RepoTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">No completed scans yet — nothing to chart.</p>;
  }

  const data = points.map((p, i) => ({ label: `#${i + 1}`, healthScore: p.summary.healthScore }));

  return (
    <div className="h-64 w-full rounded-lg border p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis domain={[0, 100]} />
          <Line type="monotone" dataKey="healthScore" stroke="#2a78d6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
