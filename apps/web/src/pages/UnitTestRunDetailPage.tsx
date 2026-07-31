import { Link, useParams } from 'react-router-dom';
import { useUnitTestGeneratedFiles, useUnitTestResults, useUnitTestRun } from '../api/hooks.js';
import { UnitTestRunStatusPanel } from '../components/UnitTestRunStatusPanel.js';
import { TestResultsList } from '../components/TestResultsList.js';
import { UnitTestReportActions } from '../components/UnitTestReportActions.js';

export function UnitTestRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const runQuery = useUnitTestRun(runId);
  const filesQuery = useUnitTestGeneratedFiles(runId);
  const resultsQuery = useUnitTestResults(runId);
  const run = runQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {run && (
        <Link to={`/repos/${run.repoId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to repo
        </Link>
      )}

      <UnitTestRunStatusPanel run={run} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">
          Generated files {filesQuery.data ? `(${filesQuery.data.length})` : ''}
        </h2>
        {filesQuery.data && filesQuery.data.length === 0 && (
          <p className="text-sm text-neutral-500">
            No files generated yet
            {run?.status === 'completed'
              ? ' — no exported functions were found in the target.'
              : '.'}
          </p>
        )}
        <ul className="space-y-1 text-sm">
          {filesQuery.data?.map((file) => (
            <li key={file.id} className="rounded border px-3 py-1.5">
              <span className="text-neutral-500">{file.sourceFilePath}</span>
              {' → '}
              <code className="font-mono">{file.testFilePath}</code>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">
          Test results {resultsQuery.data ? `(${resultsQuery.data.length})` : ''}
        </h2>
        <TestResultsList results={resultsQuery.data ?? []} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Reports</h2>
        {runId && (
          <UnitTestReportActions
            runId={runId}
            {...(run?.status ? { runStatus: run.status } : {})}
          />
        )}
      </section>
    </div>
  );
}
