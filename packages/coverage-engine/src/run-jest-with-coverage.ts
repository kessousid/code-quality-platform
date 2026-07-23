import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { CoverageMapData } from 'istanbul-lib-coverage';
import {
  runSubprocess,
  ToolNotFoundError,
  withUnhandledRejectionsAsWarnings,
} from '@cqp/plugin-shared';
import { ensureJestAvailable } from '@cqp/unit-test-engine';

export interface JestCoverageRunResult {
  /** Parsed contents of Istanbul's `coverage-final.json`, or `null` if the repo has no tests (a legitimate result, not a crash — see below). */
  coverageFinalJson: CoverageMapData | null;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
}

interface JestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
}

/**
 * Runs the repo's OWN existing Jest suite with `--coverage` — no test
 * generation, no LLM, and deliberately no positional file-pattern
 * argument, so Jest runs whatever its own `testMatch` already selects
 * (docs/adr/0025). Reuses `ensureJestAvailable` from @cqp/unit-test-engine
 * so this gets the same Windows `.cmd`-shim fix and auto-install behavior
 * for free, without duplicating that logic.
 *
 * `--coverageDirectory` is pinned to a throwaway tmp path rather than
 * trusting the repo's own configured directory: (1) determinism — this
 * engine knows exactly where to read `coverage-final.json` from without
 * inspecting the target repo's jest.config; (2) it must not clobber or get
 * confused by coverage output a real CI run in that same repo produces
 * independently.
 */
export async function runJestWithCoverage(
  repoRoot: string,
  needsTypeScriptTransform: boolean,
): Promise<JestCoverageRunResult> {
  const { command, leadingArgs } = await ensureJestAvailable(repoRoot, needsTypeScriptTransform);

  const runId = Date.now();
  const coverageDir = join(repoRoot, `.cqp-coverage-${runId}`);
  const outputFile = join(repoRoot, `.cqp-jest-output-${runId}.json`);

  let stderr = '';
  try {
    const result = await runSubprocess(
      command,
      [
        ...leadingArgs,
        '--coverage',
        '--coverageReporters=json',
        `--coverageDirectory=${coverageDir}`,
        '--json',
        `--outputFile=${outputFile}`,
        // Without this, jest treats "zero test files matched" as a hard error and never writes a report at
        // all — but a repo with no tests is a legitimate 0%-covered, gate-failing result, not an engine crash.
        '--passWithNoTests',
      ],
      { cwd: repoRoot, envVarName: 'CQP_JEST_PATH', env: withUnhandledRejectionsAsWarnings() },
    );
    stderr = result.stderr;
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      throw error;
    }
    // jest exits non-zero when any test fails, or when it finds zero tests — neither is a tool failure; the JSON report is still expected.
  }

  const rawOutput = await readFile(outputFile, 'utf-8').catch(() => null);
  const rawCoverage = await readFile(join(coverageDir, 'coverage-final.json'), 'utf-8').catch(
    () => null,
  );
  await rm(outputFile, { force: true }).catch(() => {});
  await rm(coverageDir, { recursive: true, force: true }).catch(() => {});

  if (rawOutput === null) {
    // Jest failed to start (config/transform error) before it could write anything — surface its own stderr rather than a bare "no report" message.
    throw new Error(
      `jest did not produce a JSON report — it likely failed to start.${stderr ? `\n\n${stderr}` : ''}`,
    );
  }

  const parsed = JSON.parse(rawOutput) as JestJsonOutput;
  // Deliberately NOT NoTestsFoundError here (unlike run-jest.ts's generation flow): a repo with zero
  // tests must flow through as a legitimate 0%-covered, gate-failing result, not an engine crash.
  return {
    coverageFinalJson: rawCoverage !== null ? (JSON.parse(rawCoverage) as CoverageMapData) : null,
    testsTotal: parsed.numTotalTests,
    testsPassed: parsed.numPassedTests,
    testsFailed: parsed.numFailedTests,
  };
}

/** Whether `repoRoot` looks like a TypeScript project — presence of a root tsconfig.json, the same signal a real dev's editor/tooling would use. */
export function repoNeedsTypeScriptTransform(repoRoot: string): boolean {
  return existsSync(join(repoRoot, 'tsconfig.json'));
}
