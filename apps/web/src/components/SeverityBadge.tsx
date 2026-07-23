import type { Severity } from '@cqp/core';
import { cn } from '../lib/cn.js';

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  info: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', SEVERITY_CLASSES[severity])}>
      {severity}
    </span>
  );
}
