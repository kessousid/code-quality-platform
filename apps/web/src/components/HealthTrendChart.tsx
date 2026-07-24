import type { ReactElement } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { RepoTrendPoint } from '../api/hooks.js';

interface ChartPoint {
  label: string;
  healthScore: number;
  failed: boolean;
  /**
   * A completed scan with zero persisted findings is indistinguishable,
   * from healthScore alone, between "genuinely clean" and "nothing
   * actually ran" (a missing scanner binary, or a plugin erroring out —
   * plugin-level status is logged, not persisted, see docs/adr/0021). This
   * flags that ambiguity rather than silently rendering a false "100 =
   * clean" the same as a real clean result.
   */
  zeroSignal: boolean;
}

interface DotRenderProps {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}

function renderDot(props: DotRenderProps): ReactElement<SVGElement> {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) {
    return <circle cx={0} cy={0} r={0} fill="none" />;
  }
  if (payload.failed) {
    return <circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#dc2626" strokeWidth={2} />;
  }
  if (payload.zeroSignal) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#fff"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeDasharray="2 2"
      />
    );
  }
  return <circle cx={cx} cy={cy} r={4} fill="#2a78d6" />;
}

/** Replaces the Phase 3 preview fixture with real per-scan health scores (Phase 10). */
export function HealthTrendChart({ points }: { points: RepoTrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">No completed scans yet — nothing to chart.</p>;
  }

  const data: ChartPoint[] = points.map((p, i) => ({
    label: `#${i + 1}`,
    healthScore: p.summary.healthScore,
    failed: p.scan.status === 'failed',
    zeroSignal: p.summary.totalFindings === 0,
  }));

  const hasFailed = data.some((d) => d.failed);
  const hasZeroSignal = data.some((d) => d.zeroSignal && !d.failed);

  return (
    <div className="space-y-2">
      <div className="h-64 w-full rounded-lg border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis domain={[0, 100]} />
            <Line
              type="monotone"
              dataKey="healthScore"
              stroke="#2a78d6"
              strokeWidth={2}
              dot={renderDot}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {(hasFailed || hasZeroSignal) && (
        <ul className="space-y-1 text-xs text-neutral-500">
          {hasFailed && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-red-600 bg-white" />
              Failed scan — some findings may not have been saved; the score only reflects what was.
            </li>
          )}
          {hasZeroSignal && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-neutral-400 bg-white" />
              Zero findings — either a genuinely clean result, or the scanners couldn&apos;t run
              (e.g. a missing tool); can&apos;t currently tell which.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
