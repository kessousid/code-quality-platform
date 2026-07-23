import type { CoverageRun } from '@cqp/core';
import { useCancelCoverageRun } from '../api/hooks.js';

interface CoverageRunStatusPanelProps {
  run: CoverageRun | undefined;
}

/** Mirrors UnitTestRunStatusPanel's shape (docs/adr/0023, docs/adr/0024) — the one addition: a prominent pass/fail gate verdict banner, since that's the headline result here (docs/adr/0025). */
export function CoverageRunStatusPanel({ run }: CoverageRunStatusPanelProps) {
  const cancelRun = useCancelCoverageRun(run?.id);
  const isActive = run?.status === 'queued' || run?.status === 'running';

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Coverage gate against <code className="font-mono text-base">{run?.baseRef ?? '…'}</code>
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

function StatusBanner({ run }: { run: CoverageRun | undefined }) {
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

function RunningProgress({ run }: { run: CoverageRun }) {
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
        <div className="h-full animate-pulse rounded bg-blue-600" style={{ width: '30%' }} />
      </div>
      <p className="text-xs text-neutral-500">
        {run.filesTotal !== undefined
          ? `Analyzing ${run.filesTotal} changed file(s)…`
          : 'Starting…'}
      </p>
    </div>
  );
}

function GateVerdictBanner({ run }: { run: CoverageRun }) {
  const gatePassed = run.gatePassed ?? false;

  if (gatePassed) {
    return (
      <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
        Gate passed — every changed line is covered and all tests pass.
      </p>
    );
  }

  const uncoveredNote =
    (run.uncoveredLinesTotal ?? 0) > 0
      ? `${run.uncoveredLinesTotal} of ${run.changedLinesTotal ?? 0} changed line(s) uncovered`
      : undefined;
  const failingNote = (run.testsFailed ?? 0) > 0 ? `${run.testsFailed} test(s) failing` : undefined;
  const reasons = [uncoveredNote, failingNote].filter(Boolean).join(', ');

  return (
    <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
      Gate failed{reasons ? ` — ${reasons}` : '.'}
    </p>
  );
}

function CompletedSummary({ run }: { run: CoverageRun }) {
  return (
    <div className="space-y-3">
      <GateVerdictBanner run={run} />
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-lg border p-4 text-center">
          <div className="text-2xl font-semibold">{run.testsTotal ?? 0}</div>
          <div className="text-xs text-neutral-500">Tests total</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <div className="text-2xl font-semibold text-green-700">{run.testsPassed ?? 0}</div>
          <div className="text-xs text-neutral-500">Tests passed</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl font-semibold text-red-700">{run.testsFailed ?? 0}</div>
          <div className="text-xs text-neutral-500">Tests failed</div>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <div className="text-2xl font-semibold">{run.changedLinesTotal ?? 0}</div>
          <div className="text-xs text-neutral-500">Changed lines</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl font-semibold text-red-700">{run.uncoveredLinesTotal ?? 0}</div>
          <div className="text-xs text-neutral-500">Uncovered lines</div>
        </div>
      </div>
    </div>
  );
}
