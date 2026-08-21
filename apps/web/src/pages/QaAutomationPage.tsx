import { useState } from 'react';
import {
  isSkippedTestResult,
  QA_AUTOMATION_RUN_STATUS_LABELS,
  type QaAutomationEnvironment,
  type QaAutomationReportFormat,
  type QaAutomationRun,
} from '@cqp/core';
import {
  downloadQaAutomationReport,
  useGenerateQaAutomationReport,
  useQaAutomationReports,
  useQaAutomationRun,
  useQaAutomationRuns,
  useQaAutomationSchedule,
  useQaAutomationStagingSchedule,
  useRerunQaAutomationStagingTests,
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
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {QA_AUTOMATION_RUN_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Only ever shown for a running staging run (docs/adr/0044) — a long
 * staging suite used to look identical whether it was healthy or hung;
 * this is parsed live from pytest's own progress output so there's a real
 * signal to check instead of just waiting and wondering.
 */
function RunProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${percent}% complete`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full bg-blue-600" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-neutral-500">{percent}%</span>
    </div>
  );
}

function RunResults({ runId }: { runId: string }) {
  const runQuery = useQaAutomationRun(runId);
  if (runQuery.isLoading) return <p className="text-xs text-neutral-500">Loading results…</p>;
  const results = runQuery.data?.results ?? [];
  if (results.length === 0)
    return <p className="text-xs text-neutral-500">No test results recorded.</p>;

  const passedCount = results.filter((r) => r.passed).length;
  const skippedCount = results.filter((r) => !r.passed && isSkippedTestResult(r.details)).length;
  const failedCount = results.length - passedCount - skippedCount;

  return (
    <div className="mt-2 border-t pt-2">
      <p className="text-xs font-semibold text-neutral-700">
        {passedCount} passed, {failedCount} failed, {skippedCount} skipped (of {results.length})
      </p>
      <ul className="mt-1 space-y-1">
        {results.map((result) => {
          const skipped = !result.passed && isSkippedTestResult(result.details);
          const label = result.passed ? 'PASS' : skipped ? 'SKIP' : 'FAIL';
          const color = result.passed
            ? 'text-green-700'
            : skipped
              ? 'text-amber-700'
              : 'text-red-700';
          return (
            <li key={result.id} className="text-xs">
              <div className="flex items-center gap-2">
                <span className={color}>{label}</span>
                <span className="font-medium">{result.testName}</span>
              </div>
              <div className="whitespace-pre-line text-neutral-500">{result.details}</div>
              {result.sourceUrl && (
                <a
                  href={result.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Source: {result.sourceUrl}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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

/**
 * Staging-only — a production run's test IDs come from this repo's own
 * TS registry, not the external pytest suite, so there's nothing for
 * PytestStagingTestRunner's name-resolution to re-target there. Scopes
 * a fresh staging run to just this run's non-passed, non-quarantined
 * tests (selectRerunTargets, server-side).
 */
function RerunFailedButton({ runId }: { runId: string }) {
  const rerun = useRerunQaAutomationStagingTests(runId);
  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => rerun.mutate()}
        disabled={rerun.isPending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
      >
        {rerun.isPending ? 'Queuing rerun…' : 'Rerun failed & skipped tests'}
      </button>
      {rerun.data?.status === 'queued' && (
        <span className="ml-2 text-xs text-green-700">
          Queued {rerun.data.testCount} test(s) for rerun.
        </span>
      )}
      {rerun.data?.status === 'nothing-to-rerun' && (
        <span className="ml-2 text-xs text-neutral-500">
          Nothing to rerun — every test either passed or is quarantined.
        </span>
      )}
      {rerun.isError && (
        <span className="ml-2 text-xs text-red-700">
          {rerun.error instanceof ApiError ? rerun.error.message : 'Failed to queue rerun.'}
        </span>
      )}
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
            {run.status === 'running' && run.progressPercent !== undefined && (
              <RunProgressBar percent={run.progressPercent} />
            )}
            <span className="text-xs text-neutral-500">{run.triggeredBy}</span>
            <span className="text-xs text-neutral-500">
              {new Date(run.createdAt).toLocaleString()}
            </span>
          </button>
          {expandedRunId === run.id && (
            <>
              {environment === 'staging' && run.status !== 'running' && (
                <RerunFailedButton runId={run.id} />
              )}
              <RunReportActions runId={run.id} />
              <RunResults runId={run.id} />
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

/** No interval field — production runs the whole suite together on a fixed twice-daily cron, not user-configurable (docs/adr/0042). */
function ProductionSection() {
  const scheduleQuery = useQaAutomationSchedule();
  const updateSchedule = useUpdateQaAutomationSchedule();
  const triggerRun = useTriggerQaAutomationRun();
  const schedule = scheduleQuery.data;

  return (
    <section aria-label="Production QA Automation" className="space-y-6">
      <p className="text-xs text-neutral-500">
        Runs a real, extensible suite of checks against production (portal.curatal.com) twice daily
        at 12:00 AM and 12:00 PM IST, plus a manual "Run now" option — see docs/adr/0035,
        docs/adr/0042.
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
            Currently {schedule.enabled ? 'enabled' : 'disabled'} — runs twice daily at 12:00 AM and
            12:00 PM IST when enabled.
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
