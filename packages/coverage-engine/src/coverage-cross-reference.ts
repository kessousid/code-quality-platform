import { basename, extname, join } from 'node:path';
// istanbul-lib-coverage is CJS with a `module.exports = {...}` object — Node's ESM interop
// only reliably provides that as a default export, not synthesized named exports, under a
// real `node` runtime (unlike vitest's own transform, which tolerated the named-import form).
import istanbulLibCoverage from 'istanbul-lib-coverage';
import type { CoverageMapData } from 'istanbul-lib-coverage';
import type { CoverageFileResult } from '@cqp/core';
import { isTestFilePath, SOURCE_EXTENSIONS } from '@cqp/unit-test-engine';

const { createCoverageMap } = istanbulLibCoverage;

/** A changed file worth cross-referencing at all — a real source file, not a test file, config, or docs. */
export function isEligibleSourceFile(relPath: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(relPath)) && !isTestFilePath(basename(relPath));
}

/**
 * Cross-references Istanbul's `coverage-final.json` against the set of
 * changed lines per file to determine which changed lines are actually
 * covered (docs/adr/0025). Uses `istanbul-lib-coverage`'s own
 * `getLineCoverage()` (line -> hit count) rather than hand-walking
 * `statementMap`/`s` — the same primitive Istanbul's own reporters use.
 */
export function computeCoverageFileResults(
  coverageFinalJson: CoverageMapData | null,
  changedLinesByFile: Record<string, number[]>,
  repoRoot: string,
): Omit<CoverageFileResult, 'id' | 'runId'>[] {
  const coverageMap = createCoverageMap(coverageFinalJson ?? {});
  const results: Omit<CoverageFileResult, 'id' | 'runId'>[] = [];

  for (const [relPath, changedLinesRaw] of Object.entries(changedLinesByFile)) {
    if (!isEligibleSourceFile(relPath)) continue;

    const absolutePath = join(repoRoot, relPath);
    const hasCoverageEntry = coverageMap.files().includes(absolutePath);
    const lineHits = hasCoverageEntry
      ? coverageMap.fileCoverageFor(absolutePath).getLineCoverage()
      : {};

    const changedLines: number[] = [];
    const uncoveredLines: number[] = [];

    for (const line of changedLinesRaw) {
      if (!hasCoverageEntry) {
        // This production source file was never executed by any test in the suite at all — every changed line counts as uncovered, not excluded.
        changedLines.push(line);
        uncoveredLines.push(line);
        continue;
      }
      const hits = lineHits[line];
      if (hits === undefined) continue; // not an instrumentable statement start (blank line, comment, closing brace) — excluded from the denominator entirely
      changedLines.push(line);
      if (hits === 0) uncoveredLines.push(line);
    }

    if (changedLines.length === 0) continue; // nothing coverable changed in this file

    results.push({
      filePath: relPath,
      changedLines,
      uncoveredLines,
      status: uncoveredLines.length > 0 ? 'uncovered' : 'covered',
    });
  }

  return results;
}
