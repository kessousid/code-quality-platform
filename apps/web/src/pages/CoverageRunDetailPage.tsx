import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCoverageFileResults, useCoverageRun } from '../api/hooks.js';
import { CoverageRunStatusPanel } from '../components/CoverageRunStatusPanel.js';
import { CoverageFileResultsList } from '../components/CoverageFileResultsList.js';
import { CoverageReportActions } from '../components/CoverageReportActions.js';

export function CoverageRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const runQuery = useCoverageRun(runId);
  const fileResultsQuery = useCoverageFileResults(runId);
  const run = runQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {run && (
        <Link to={`/repos/${run.repoId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to repo
        </Link>
      )}

      <CoverageRunStatusPanel run={run} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">
          Changed files {fileResultsQuery.data ? `(${fileResultsQuery.data.length})` : ''}
        </h2>
        <CoverageFileResultsList
          results={fileResultsQuery.data ?? []}
          repoId={run?.repoId}
          baseRef={run?.baseRef}
          onGenerated={(newRun) => navigate(`/coverage-runs/${newRun.id}`)}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Reports</h2>
        {runId && <CoverageReportActions runId={runId} />}
      </section>
    </div>
  );
}
