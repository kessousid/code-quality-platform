import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCoverageFileResults,
  useCoverageRun,
  useCoverageRuns,
  useCreateCoverageRun,
} from '../api/hooks.js';
import { CoverageRunStatusPanel } from './CoverageRunStatusPanel.js';
import { CoverageFileResultsList } from './CoverageFileResultsList.js';

interface CoverageGateSectionProps {
  repoId: string;
  defaultBranch: string | undefined;
}

/**
 * Split out of RepoDetailPage to keep that component's own branching
 * simple (see docs/adr/0025) — the primary Unit Testing flow: zero-LLM,
 * checks whether developers actually tested their own changed lines.
 *
 * Shows the latest run's full result (verdict + fixable file list)
 * right here, inline — not just a list of links to click through.
 * Generating a test for an uncovered file re-runs the gate and swaps
 * this same view to the fresh result, with no navigation at all; a
 * developer shouldn't have to leave this page to close the loop.
 */
export function CoverageGateSection({ repoId, defaultBranch }: CoverageGateSectionProps) {
  const coverageRunsQuery = useCoverageRuns(repoId);
  const createCoverageRun = useCreateCoverageRun();
  const [baseRef, setBaseRef] = useState('');
  const [currentRunId, setCurrentRunId] = useState<string | undefined>(undefined);

  // Default to the most recent run once the list loads, without clobbering a run the user/flow just set.
  useEffect(() => {
    if (currentRunId === undefined && coverageRunsQuery.data?.data[0]) {
      setCurrentRunId(coverageRunsQuery.data.data[0].id);
    }
  }, [currentRunId, coverageRunsQuery.data]);

  const currentRunQuery = useCoverageRun(currentRunId);
  const currentFileResultsQuery = useCoverageFileResults(currentRunId);
  const currentRun = currentRunQuery.data;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const run = await createCoverageRun.mutateAsync({
        repoId,
        ...(baseRef.trim().length > 0 ? { baseRef: baseRef.trim() } : {}),
      });
      setCurrentRunId(run.id);
    } catch {
      // surfaced via createCoverageRun.isError, if the UI grows one
    }
  }

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-600">Coverage gate</h2>
        <p className="text-xs text-neutral-500">
          Diffs your working tree (including uncommitted edits) against a base branch, runs this
          repo's own existing Jest tests with real coverage collection, and fails if any changed
          line lacks coverage or any test is failing. No AI involved — it checks whether you tested
          your own code, not whether the tests were written for you.
        </p>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
          <input
            value={baseRef}
            onChange={(e) => setBaseRef(e.target.value)}
            placeholder={`Base branch (defaults to "${defaultBranch ?? 'main'}")`}
            className="min-w-64 flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createCoverageRun.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Run coverage gate
          </button>
        </form>
      </section>

      {currentRunId && (
        <section className="space-y-3">
          <CoverageRunStatusPanel run={currentRun} />
          {currentRun?.status === 'completed' && (
            <CoverageFileResultsList
              results={currentFileResultsQuery.data ?? []}
              repoId={currentRun.repoId}
              baseRef={currentRun.baseRef}
              onGenerated={(newRun) => setCurrentRunId(newRun.id)}
            />
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Past runs</h2>
        {coverageRunsQuery.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {coverageRunsQuery.data && coverageRunsQuery.data.data.length === 0 && (
          <p className="text-sm text-neutral-500">No coverage gate runs yet.</p>
        )}
        <ul className="divide-y rounded-lg border">
          {coverageRunsQuery.data?.data.map((run) => (
            <li key={run.id} className="flex items-center justify-between p-3">
              <button
                type="button"
                onClick={() => setCurrentRunId(run.id)}
                className="text-blue-600 hover:underline"
              >
                {run.baseRef}
              </button>
              <span className="flex items-center gap-2 text-xs">
                {run.status === 'completed' && (
                  <span
                    className={
                      run.gatePassed
                        ? 'rounded bg-green-100 px-2 py-0.5 font-medium text-green-700'
                        : 'rounded bg-red-100 px-2 py-0.5 font-medium text-red-700'
                    }
                  >
                    {run.gatePassed ? 'Passed' : 'Failed'}
                  </span>
                )}
                <span className="text-neutral-500">
                  {run.status}
                  {run.status === 'running' && run.filesTotal !== undefined && (
                    <>
                      {' '}
                      ({run.filesCompleted ?? 0}/{run.filesTotal})
                    </>
                  )}
                </span>
                <Link to={`/coverage-runs/${run.id}`} className="text-blue-600 hover:underline">
                  Reports
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
