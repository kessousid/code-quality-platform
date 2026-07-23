import type { CoverageFileResult } from '@cqp/core';
import { computeChangedLinesFromWorkingTree } from '@cqp/scan-engine';
import { computeCoverageFileResults } from './coverage-cross-reference.js';
import { repoNeedsTypeScriptTransform, runJestWithCoverage } from './run-jest-with-coverage.js';

export type CoverageProgressEvent = { type: 'total'; total: number } | { type: 'running-tests' };

export interface RunCoverageGateOptions {
  onProgress?: (event: CoverageProgressEvent) => void;
  signal?: AbortSignal;
}

export interface CoverageGateResult {
  fileResults: Omit<CoverageFileResult, 'id' | 'runId'>[];
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  changedLinesTotal: number;
  uncoveredLinesTotal: number;
  /** Zero-tolerance verdict (docs/adr/0025): every changed line covered AND every test passing. */
  gatePassed: boolean;
}

class AbortedError extends Error {
  constructor() {
    super('Coverage gate run was cancelled.');
    this.name = 'AbortedError';
  }
}

/**
 * Diffs the working tree against `baseRef` -> runs the repo's OWN existing
 * Jest suite with `--coverage` -> cross-references changed lines against
 * Istanbul's output (docs/adr/0025). No test generation, no LLM. Progress
 * is coarser than the generation flow's per-file events on purpose: the
 * jest run itself is one atomic subprocess call with no per-file
 * granularity available, same limitation `runJest` already has.
 */
export async function runCoverageGate(
  repoRoot: string,
  baseRef: string,
  options: RunCoverageGateOptions = {},
): Promise<CoverageGateResult> {
  const changedLinesByFile = await computeChangedLinesFromWorkingTree(repoRoot, baseRef);
  options.onProgress?.({ type: 'total', total: Object.keys(changedLinesByFile).length });

  if (options.signal?.aborted) throw new AbortedError();

  options.onProgress?.({ type: 'running-tests' });
  const needsTypeScriptTransform = repoNeedsTypeScriptTransform(repoRoot);
  const { coverageFinalJson, testsTotal, testsPassed, testsFailed } = await runJestWithCoverage(
    repoRoot,
    needsTypeScriptTransform,
  );

  if (options.signal?.aborted) throw new AbortedError();

  const fileResults = computeCoverageFileResults(coverageFinalJson, changedLinesByFile, repoRoot);
  const changedLinesTotal = fileResults.reduce((sum, f) => sum + f.changedLines.length, 0);
  const uncoveredLinesTotal = fileResults.reduce((sum, f) => sum + f.uncoveredLines.length, 0);

  return {
    fileResults,
    testsTotal,
    testsPassed,
    testsFailed,
    changedLinesTotal,
    uncoveredLinesTotal,
    gatePassed: uncoveredLinesTotal === 0 && testsFailed === 0,
  };
}
