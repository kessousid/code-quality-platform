import { useEffect, useState } from 'react';
import type { CronEnvironment, CronRun } from '@cqp/core';
import { useCronRuns, useCrons, useTriggerCronRun } from '../api/hooks.js';
import { ApiError } from '../api/client.js';

const ENVIRONMENT_LABELS: Record<CronEnvironment, string> = {
  dev: 'Dev',
  staging: 'Staging',
};

function formatResponseBody(body: string | undefined): string {
  if (body === undefined) return '';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function StatusBadge({ status }: { status: CronRun['status'] }) {
  const color =
    status === 'succeeded'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : 'bg-neutral-100 text-neutral-600';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

interface CronsPageProps {
  onChangeFeature?: () => void;
}

/** See docs/adr/0033 — this is a blocking HTTP call to an external system, not a queued job; the mutation's own pending state is the "live status." */
export function CronsPage({ onChangeFeature }: CronsPageProps = {}) {
  const cronsQuery = useCrons();
  const cronRunsQuery = useCronRuns();
  const triggerCronRun = useTriggerCronRun();
  const [cronId, setCronId] = useState('');
  const [environment, setEnvironment] = useState<CronEnvironment>('dev');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!triggerCronRun.isPending) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [triggerCronRun.isPending]);

  function handleRun() {
    if (cronId.trim().length === 0) return;
    triggerCronRun.mutate({ cronId, environment });
  }

  const result = triggerCronRun.data;
  const error = triggerCronRun.error;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cron Runner</h1>
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
        Triggers a real cron on the external COD platform for the chosen environment. This is a
        blocking call — a very slow cron could hit an HTTP timeout; see docs/adr/0033.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Cron"
          value={cronId}
          onChange={(e) => setCronId(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">Select a cron…</option>
          {cronsQuery.data?.crons.map((cron) => (
            <option key={cron.id} value={cron.id}>
              {cron.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Environment"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as CronEnvironment)}
          className="rounded border px-3 py-2 text-sm"
        >
          {(cronsQuery.data?.environments ?? ['dev', 'staging']).map((env) => (
            <option key={env} value={env}>
              {ENVIRONMENT_LABELS[env]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRun}
          disabled={triggerCronRun.isPending || cronId.trim().length === 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Run
        </button>
      </div>

      {triggerCronRun.isPending && (
        <p className="text-sm text-neutral-600">Running… {elapsedSeconds}s elapsed</p>
      )}

      {result && !triggerCronRun.isPending && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            {result.statusCode !== undefined && (
              <span className="text-xs text-neutral-500">HTTP {result.statusCode}</span>
            )}
          </div>
          {result.errorMessage && <p className="text-sm text-red-700">{result.errorMessage}</p>}
          {result.responseBody !== undefined && (
            <pre className="max-h-64 overflow-auto rounded bg-neutral-50 p-2 text-xs">
              {formatResponseBody(result.responseBody)}
            </pre>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to trigger the cron.'}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Run history</h2>
        <ul className="space-y-2">
          {cronRunsQuery.data?.data.map((run) => (
            <li key={run.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{run.cronName}</span>
                <span className="text-xs text-neutral-500">
                  {ENVIRONMENT_LABELS[run.environment]}
                </span>
                <StatusBadge status={run.status} />
                {run.statusCode !== undefined && (
                  <span className="text-xs text-neutral-500">HTTP {run.statusCode}</span>
                )}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {new Date(run.createdAt).toLocaleString()}
              </div>
              {(run.errorMessage ?? run.responseBody) && (
                <div className="mt-1 truncate text-xs text-neutral-400">
                  {run.errorMessage ?? run.responseBody}
                </div>
              )}
            </li>
          ))}
          {cronRunsQuery.data?.data.length === 0 && (
            <p className="text-sm text-neutral-500">No cron runs yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
