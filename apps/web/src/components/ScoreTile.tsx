import { cn } from '../lib/cn.js';

export interface ScoreTileProps {
  label: string;
  value: number;
  tone?: 'good' | 'warning' | 'critical';
}

const toneClasses: Record<NonNullable<ScoreTileProps['tone']>, string> = {
  good: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  warning: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  critical: 'border-red-500/40 text-red-600 dark:text-red-400',
};

/**
 * Phase 3 proof-of-pipeline component (Tailwind + shadcn-style primitive
 * pattern). The real score tiles (health/security/quality/debt) are wired
 * to live scan data in Phase 10.
 */
export function ScoreTile({ label, value, tone = 'good' }: ScoreTileProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 shadow-sm dark:bg-neutral-900',
        toneClasses[tone],
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
