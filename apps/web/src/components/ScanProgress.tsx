import type { Scan } from '@cqp/core';

interface ScanProgressProps {
  scan: Scan;
}

/** Live progress while a scan is queued/running — see docs/adr/0023. Polled via useScan's refetchInterval, not a websocket. */
export function ScanProgress({ scan }: ScanProgressProps) {
  if (scan.status === 'queued') {
    return (
      <p className="text-sm text-neutral-500">Queued — waiting for the worker to pick this up…</p>
    );
  }

  const total = scan.pluginsTotal;
  const completed = scan.pluginsCompleted ?? 0;
  const percent = total !== undefined && total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
        <div
          className="h-full rounded bg-blue-600 transition-all"
          style={{ width: total !== undefined ? `${percent}%` : '15%' }}
        />
      </div>
      <p className="text-xs text-neutral-500">
        {total !== undefined ? (
          <>
            Running {completed}/{total} analyzers
            {scan.currentPluginId ? ` — last started: ${scan.currentPluginId}` : ''}
          </>
        ) : (
          'Starting…'
        )}
      </p>
    </div>
  );
}
