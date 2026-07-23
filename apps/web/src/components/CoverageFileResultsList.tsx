import { useState } from 'react';
import type { CoverageFileResult, CoverageRun } from '@cqp/core';
import {
  useCreateCoverageRun,
  useCreateUnitTestRun,
  waitForUnitTestRunToFinish,
} from '../api/hooks.js';

interface CoverageFileResultsListProps {
  results: CoverageFileResult[];
  repoId: string | undefined;
  baseRef: string | undefined;
  /** What to do once the chain (generate -> run -> re-check gate) produces a fresh CoverageRun — the caller decides whether that means navigating to a new page or just updating what's shown in place. */
  onGenerated: (newRun: CoverageRun) => void;
}

type Stage = 'generating' | 're-checking';

/**
 * Split out of its page to keep that component's own branching simple
 * (mirrors TestResultsList). Also the one place the coverage gate and
 * the Gemini generator are wired together: "Generate tests" on an
 * uncovered file writes a real Jest test for it, then automatically
 * re-runs the gate to confirm — closing the loop a developer would
 * otherwise do by hand (read the file path here, retype it into the
 * generator form, come back and re-run).
 */
export function CoverageFileResultsList({
  results,
  repoId,
  baseRef,
  onGenerated,
}: CoverageFileResultsListProps) {
  const createUnitTestRun = useCreateUnitTestRun();
  const createCoverageRun = useCreateCoverageRun();
  const [inProgressFor, setInProgressFor] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(filePath: string) {
    if (!repoId || !baseRef) return;
    setInProgressFor(filePath);
    setError(null);
    try {
      setStage('generating');
      // Fixed to Gemini deliberately — this button's own label says so; pick the script generator
      // from the standalone "Generate unit tests" form (docs/adr/0026) if that's what's wanted instead.
      const unitTestRun = await createUnitTestRun.mutateAsync({
        repoId,
        target: { path: filePath },
        generator: 'gemini',
      });
      await waitForUnitTestRunToFinish(unitTestRun.id);

      setStage('re-checking');
      const coverageRun = await createCoverageRun.mutateAsync({ repoId, baseRef });
      onGenerated(coverageRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests for this file.');
    } finally {
      setInProgressFor(null);
      setStage(null);
    }
  }

  if (results.length === 0) {
    return <p className="text-sm text-neutral-500">No changed files with coverable lines.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border text-sm">
      {results.map((result) => (
        <li key={result.id} className="p-3">
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className={result.status === 'covered' ? 'text-green-600' : 'text-red-600'}>
                {result.status === 'covered' ? '✓' : '✗'}
              </span>{' '}
              <code className="font-mono">{result.filePath}</code>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                {result.changedLines.length} changed line(s)
              </span>
              {result.status === 'uncovered' && (
                <button
                  type="button"
                  onClick={() => handleGenerate(result.filePath)}
                  disabled={inProgressFor !== null || !repoId || !baseRef}
                  className="rounded border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  {inProgressFor === result.filePath
                    ? stage === 'generating'
                      ? 'Generating tests…'
                      : 'Re-checking gate…'
                    : 'Generate tests with Gemini'}
                </button>
              )}
            </div>
          </div>
          {result.uncoveredLines.length > 0 && (
            <p className="mt-1 text-xs text-red-700">
              Uncovered lines: {result.uncoveredLines.join(', ')}
            </p>
          )}
        </li>
      ))}
      {error && <li className="p-3 text-xs text-red-700">{error}</li>}
    </ul>
  );
}
