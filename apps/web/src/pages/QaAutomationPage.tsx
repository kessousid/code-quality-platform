import { useEffect, useState } from 'react';
import type { QaAutomationEnvironment, QaAutomationReportFormat, QaAutomationRun } from '@cqp/core';
import {
  downloadQaAutomationReport,
  useGenerateQaAutomationReport,
  useQaAutomationReports,
  useQaAutomationRun,
  useQaAutomationRuns,
  useQaAutomationSchedule,
  useQaAutomationStagingSchedule,
  useTriggerQaAutomationRun,
  useTriggerQaAutomationStagingRun,
  useUpdateQaAutomationSchedule,
  useUpdateQaAutomationStagingSchedule,
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

const REPORT_FORMATS: QaAutomationReportFormat[] = ['pdf', 'xlsx'];

function RunReportActions({ runId }: { runId: string }) {
  const reportsQuery = useQaAutomationReports(runId);
  const generate = useGenerateQaAutomationReport(runId);
  const existing = new Map((reportsQuery.data ?? []).map((r) => [r.format, r]));

  return (
    <div className="mt-2 flex items-center gap-2 border-t pt-2">
      {REPORT_FORMATS.map((format) => {
        const report = existing.get(format);
        return (
          <div key={format} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => generate.mutate(format)}
              disabled={generate.isPending}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {report
                ? `Regenerate ${format.toUpperCase()} report`
                : `Generate ${format.toUpperCase()} report`}
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
      })}
    </div>
  );
}

/** Shared by both the production and staging sections — filtered server-side by `environment`. */
function RunHistoryList({ environment }: { environment: QaAutomationEnvironment }) {
  const runsQuery = useQaAutomationRuns(1, 25, environment);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  return (
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
  );
}

/** "Run now" trigger button, shared shape between production and staging (docs/adr/0035, docs/adr/0036). */
function TriggerRunButton({
  onTrigger,
  isPending,
  isSuccess,
  error,
}: {
  onTrigger: () => void;
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onTrigger}
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Run now
      </button>
      {isSuccess && (
        <p className="mt-2 text-sm text-neutral-600">Queued — check run history below shortly.</p>
      )}
      {error !== null && error !== undefined && (
        <p className="mt-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to trigger a run.'}
        </p>
      )}
    </div>
  );
}

function ProductionSection() {
  const scheduleQuery = useQaAutomationSchedule();
  const updateSchedule = useUpdateQaAutomationSchedule();
  const triggerRun = useTriggerQaAutomationRun();
  const [intervalHours, setIntervalHours] = useState<number | ''>('');
  const [touchedInterval, setTouchedInterval] = useState(false);

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
    <section aria-label="Production QA Automation" className="space-y-6">
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

      <TriggerRunButton
        onTrigger={() => triggerRun.mutate()}
        isPending={triggerRun.isPending}
        isSuccess={triggerRun.isSuccess}
        error={triggerRun.error}
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Run history</h2>
        <RunHistoryList environment="production" />
      </section>
    </section>
  );
}

/** No interval field — the staging cron pattern (once daily at midnight IST) is a fixed constant, not user-configurable (docs/adr/0036). */
function StagingSection() {
  const scheduleQuery = useQaAutomationStagingSchedule();
  const updateSchedule = useUpdateQaAutomationStagingSchedule();
  const triggerRun = useTriggerQaAutomationStagingRun();
  const schedule = scheduleQuery.data;

  return (
    <section aria-label="Staging QA Automation" className="space-y-6">
      <p className="text-xs text-neutral-500">
        Runs the shared staging test suite (curatal_tests) against staging.curatal.com once daily at
        12:00 AM IST, plus a manual "Run now" option — see docs/adr/0036.
      </p>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold text-neutral-600">Schedule</h2>
        <button
          type="button"
          onClick={() => updateSchedule.mutate({ enabled: !(schedule?.enabled ?? true) })}
          disabled={updateSchedule.isPending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {schedule?.enabled ? 'Disable' : 'Enable'}
        </button>
        {schedule && (
          <p className="text-xs text-neutral-500">
            Currently {schedule.enabled ? 'enabled' : 'disabled'} — runs daily at 12:00 AM IST when
            enabled.
          </p>
        )}
      </section>

      <TriggerRunButton
        onTrigger={() => triggerRun.mutate()}
        isPending={triggerRun.isPending}
        isSuccess={triggerRun.isSuccess}
        error={triggerRun.error}
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Run history</h2>
        <RunHistoryList environment="staging" />
      </section>
    </section>
  );
}

interface QaAutomationPageProps {
  onChangeFeature?: () => void;
}

type QaAutomationTab = 'production' | 'staging';

/** See docs/adr/0035 (production) and docs/adr/0036 (staging) — two independent environments, switched between via the two buttons rather than shown stacked together. */
export function QaAutomationPage({ onChangeFeature }: QaAutomationPageProps = {}) {
  const [activeTab, setActiveTab] = useState<QaAutomationTab>('production');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">QA Automation</h1>
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

      <div className="flex gap-2 border-b pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('production')}
          aria-pressed={activeTab === 'production'}
          className={`rounded px-4 py-2 text-sm font-medium ${
            activeTab === 'production' ? 'bg-blue-600 text-white' : 'border text-neutral-700'
          }`}
        >
          Production
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('staging')}
          aria-pressed={activeTab === 'staging'}
          className={`rounded px-4 py-2 text-sm font-medium ${
            activeTab === 'staging' ? 'bg-blue-600 text-white' : 'border text-neutral-700'
          }`}
        >
          Staging
        </button>
      </div>

      {activeTab === 'production' ? <ProductionSection /> : <StagingSection />}
    </div>
  );
}
