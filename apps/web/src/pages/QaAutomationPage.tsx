import { useEffect, useState } from 'react';
import type { QaAutomationRun } from '@cqp/core';
import {
  downloadQaAutomationReport,
  useGenerateQaAutomationReport,
  useQaAutomationReports,
  useQaAutomationRun,
  useQaAutomationRuns,
  useQaAutomationSchedule,
  useTriggerQaAutomationRun,
  useUpdateQaAutomationSchedule,
} from '../api/hooks.js';
import { ApiError } from '../api/client.js';

function StatusBadge({ status }: { status: QaAutomationRun['status'] }) {
  const color =
    status === 'completed'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : 'bg-neutral-100 text-neutral-600';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

function RunResults({ runId }: { runId: string }) {
  const runQuery = useQaAutomationRun(runId);
  if (runQuery.isLoading) return <p className="text-xs text-neutral-500">Loading results…</p>;
  const results = runQuery.data?.results ?? [];
  if (results.length === 0)
    return <p className="text-xs text-neutral-500">No test results recorded.</p>;

  return (
    <ul className="mt-2 space-y-1 border-t pt-2">
      {results.map((result) => (
        <li key={result.id} className="text-xs">
          <div className="flex items-center gap-2">
            <span className={result.passed ? 'text-green-700' : 'text-red-700'}>
              {result.passed ? 'PASS' : 'FAIL'}
            </span>
            <span className="font-medium">{result.testName}</span>
          </div>
          <div className="whitespace-pre-line text-neutral-500">{result.details}</div>
        </li>
      ))}
    </ul>
  );
}

function RunReportActions({ runId }: { runId: string }) {
  const reportsQuery = useQaAutomationReports(runId);
  const generate = useGenerateQaAutomationReport(runId);
  const report = reportsQuery.data?.[0];

  return (
    <div className="mt-2 flex items-center gap-2 border-t pt-2">
      <button
        type="button"
        onClick={() => generate.mutate('pdf')}
        disabled={generate.isPending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
      >
        {report ? 'Regenerate PDF report' : 'Generate PDF report'}
      </button>
      {report && (
        <button
          type="button"
          onClick={() => downloadQaAutomationReport(report)}
          className="text-xs text-blue-600 hover:underline"
        >
          Download
        </button>
      )}
    </div>
  );
}

interface QaAutomationPageProps {
  onChangeFeature?: () => void;
}

/** See docs/adr/0035 — the interval is stored server-side and adjustable here without a redeploy; "Run now" always runs the full suite regardless of frequency gating. */
export function QaAutomationPage({ onChangeFeature }: QaAutomationPageProps = {}) {
  const scheduleQuery = useQaAutomationSchedule();
  const updateSchedule = useUpdateQaAutomationSchedule();
  const triggerRun = useTriggerQaAutomationRun();
  const runsQuery = useQaAutomationRuns();
  const [intervalHours, setIntervalHours] = useState<number | ''>('');
  const [touchedInterval, setTouchedInterval] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const schedule = scheduleQuery.data;

  // Pre-fills the field from the loaded schedule exactly once — without
  // `touchedInterval`, the fallback would re-snap to the server value on
  // every render, making it impossible to actually clear/retype the field.
  useEffect(() => {
    if (!touchedInterval && schedule) setIntervalHours(schedule.intervalHours);
  }, [schedule, touchedInterval]);

  function handleSave() {
    const value = intervalHours === '' ? (schedule?.intervalHours ?? 12) : intervalHours;
    updateSchedule.mutate({ intervalHours: value, enabled: schedule?.enabled ?? true });
  }

  function handleToggleEnabled() {
    updateSchedule.mutate({ enabled: !(schedule?.enabled ?? true) });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Production QA Automation</h1>
        {onChangeFeature && (
          <button
            type="button"
            onClick={onChangeFeature}
            className="text-sm text-blue-600 hover:underline"
          >
            Switch feature
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Runs a real, extensible suite of checks against production (portal.curatal.com) on a
        schedule you control — see docs/adr/0035.
      </p>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold text-neutral-600">Schedule</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="interval-hours">
            Every
          </label>
          <input
            id="interval-hours"
            type="number"
            min={1}
            aria-label="Interval hours"
            value={intervalHours}
            onChange={(e) => {
              setTouchedInterval(true);
              setIntervalHours(e.target.value === '' ? '' : Number(e.target.value));
            }}
            className="w-20 rounded border px-3 py-2 text-sm"
          />
          <span className="text-sm">hours</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateSchedule.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleToggleEnabled}
            disabled={updateSchedule.isPending}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {schedule?.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
        {schedule && (
          <p className="text-xs text-neutral-500">
            Currently {schedule.enabled ? 'enabled' : 'disabled'}, every {schedule.intervalHours}{' '}
            hour(s).
          </p>
        )}
      </section>

      <div>
        <button
          type="button"
          onClick={() => triggerRun.mutate()}
          disabled={triggerRun.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Run now
        </button>
        {triggerRun.isSuccess && (
          <p className="mt-2 text-sm text-neutral-600">Queued — check run history below shortly.</p>
        )}
        {triggerRun.error && (
          <p className="mt-2 text-sm text-red-700">
            {triggerRun.error instanceof ApiError
              ? triggerRun.error.message
              : 'Failed to trigger a run.'}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Run history</h2>
        <ul className="space-y-2">
          {runsQuery.data?.data.map((run) => (
            <li key={run.id} className="rounded-lg border p-3 text-sm">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
              >
                <StatusBadge status={run.status} />
                <span className="text-xs text-neutral-500">{run.triggeredBy}</span>
                <span className="text-xs text-neutral-500">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </button>
              {expandedRunId === run.id && (
                <>
                  <RunResults runId={run.id} />
                  <RunReportActions runId={run.id} />
                </>
              )}
            </li>
          ))}
          {runsQuery.data?.data.length === 0 && (
            <p className="text-sm text-neutral-500">No runs yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
