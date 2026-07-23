import type { Scan } from '@cqp/core';
import { useCancelScan } from '../api/hooks.js';
import { ScanProgress } from './ScanProgress.js';

interface ScanStatusHeaderProps {
  scanId: string;
  scan: Scan | undefined;
}

/** The title row + cancel button + progress/cancelled/failed banners — split out of ScanDetailPage to keep that component's own branching simple. */
export function ScanStatusHeader({ scanId, scan }: ScanStatusHeaderProps) {
  const cancelScan = useCancelScan(scanId);
  const isActive = scan?.status === 'queued' || scan?.status === 'running';

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Scan <code className="font-mono text-base">{scanId}</code>
        </h1>
        {isActive && (
          <button
            type="button"
            onClick={() => cancelScan.mutate()}
            disabled={cancelScan.isPending}
            className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {cancelScan.isPending ? 'Cancelling…' : 'Cancel scan'}
          </button>
        )}
      </div>

      {scan && isActive && <ScanProgress scan={scan} />}
      {scan?.status === 'cancelled' && (
        <p className="rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          This scan was cancelled.
        </p>
      )}
      {scan?.status === 'failed' && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          This scan failed.
        </p>
      )}
    </>
  );
}
