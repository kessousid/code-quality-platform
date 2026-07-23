import type { UnitTestRun } from '@cqp/core';
import { useCancelUnitTestRun } from '../api/hooks.js';
import { formatTargetPath } from '../lib/format-target-path.js';

interface UnitTestRunStatusPanelProps {
  run: UnitTestRun | undefined;
}

/** The title row + cancel button + progress/cancelled/failed/summary banners — split out of UnitTestRunDetailPage to keep that component's own branching simple, mirroring ScanStatusHeader. */
export function UnitTestRunStatusPanel({ run }: UnitTestRunStatusPanelProps) {
  const cancelRun = useCancelUnitTestRun(run?.id);
  const isActive = run?.status === 'queued' || run?.status === 'running';

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Unit tests for{' '}
          <code className="font-mono text-base">
            {run ? formatTargetPath(run.target.path) : '…'}
          </code>
          {run?.target.functionName ? (
            <span className="text-neutral-500"> :: {run.target.functionName}</span>
          ) : (
            ''
          )}
        </h1>
        {isActive && (
          <button
            type="button"
            onClick={() => cancelRun.mutate()}
            disabled={cancelRun.isPending}
            className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {cancelRun.isPending ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>

      <StatusBanner run={run} />
    </>
  );
}

function StatusBanner({ run }: { run: UnitTestRun | undefined }) {
  switch (run?.status) {
    case 'queued':
      return (
        <p className="text-sm text-neutral-500">Queued — waiting for the worker to pick this up…</p>
      );
    case 'running':
      return <RunningProgress run={run} />;
    case 'cancelled':
      return (
        <p className="rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          This run was cancelled.
        </p>
      );
    case 'failed':
      return (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          This run failed{run.errorMessage ? `: ${run.errorMessage}` : '.'}
        </p>
      );
    case 'completed':
      return <CompletedSummary run={run} />;
    default:
      return null;
  }
}

function RunningProgress({ run }: { run: UnitTestRun }) {
  const percent =
    run.filesTotal !== undefined && run.filesTotal > 0
      ? Math.round(((run.filesCompleted ?? 0) / run.filesTotal) * 100)
      : undefined;

  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
        <div
          className="h-full rounded bg-blue-600 transition-all"
          style={{ width: `${percent ?? 15}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500">
        {run.filesTotal !== undefined ? (
          <>
            Generating/running {run.filesCompleted ?? 0}/{run.filesTotal} files
            {run.currentFilePath ? ` — current: ${run.currentFilePath}` : ''}
          </>
        ) : (
          'Starting…'
        )}
      </p>
    </div>
  );
}

function CompletedSummary({ run }: { run: UnitTestRun }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-lg border p-4 text-center">
        <div className="text-2xl font-semibold">{run.testsTotal ?? 0}</div>
        <div className="text-xs text-neutral-500">Total tests</div>
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <div className="text-2xl font-semibold text-green-700">{run.testsPassed ?? 0}</div>
        <div className="text-xs text-neutral-500">Passed</div>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <div className="text-2xl font-semibold text-red-700">{run.testsFailed ?? 0}</div>
        <div className="text-xs text-neutral-500">Failed</div>
      </div>
    </div>
  );
}
