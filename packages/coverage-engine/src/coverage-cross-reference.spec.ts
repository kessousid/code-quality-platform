import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import type { CoverageMapData } from 'istanbul-lib-coverage';
import { computeCoverageFileResults, isEligibleSourceFile } from './coverage-cross-reference.js';

const repoRoot = join('C:', 'repo');

/** Hand-built Istanbul coverage-final.json fixture — no jest run needed, this is a pure function. */
function fixtureCoverage(
  filePath: string,
  statements: { line: number; hits: number }[],
): CoverageMapData {
  const statementMap: Record<
    string,
    { start: { line: number; column: number }; end: { line: number; column: number } }
  > = {};
  const s: Record<string, number> = {};
  statements.forEach((stmt, i) => {
    statementMap[String(i)] = {
      start: { line: stmt.line, column: 0 },
      end: { line: stmt.line, column: 10 },
    };
    s[String(i)] = stmt.hits;
  });
  return {
    [filePath]: {
      path: filePath,
      statementMap,
      fnMap: {},
      branchMap: {},
      s,
      f: {},
      b: {},
    },
  } as unknown as CoverageMapData;
}

describe('isEligibleSourceFile', () => {
  it('accepts real source files and rejects test files / non-source extensions', () => {
    expect(isEligibleSourceFile('src/math.ts')).toBe(true);
    expect(isEligibleSourceFile('src/math.test.ts')).toBe(false);
    expect(isEligibleSourceFile('src/math.spec.js')).toBe(false);
    expect(isEligibleSourceFile('README.md')).toBe(false);
    expect(isEligibleSourceFile('package.json')).toBe(false);
  });
});

describe('computeCoverageFileResults', () => {
  it('classifies covered, uncovered, and non-instrumentable changed lines correctly', () => {
    const absolutePath = join(repoRoot, 'src/math.ts');
    const coverage = fixtureCoverage(absolutePath, [
      { line: 4, hits: 3 }, // covered
      { line: 5, hits: 0 }, // uncovered
      // line 6 has no statement at all -> non-instrumentable, excluded from denominator
    ]);

    const results = computeCoverageFileResults(coverage, { 'src/math.ts': [4, 5, 6] }, repoRoot);

    expect(results).toEqual([
      { filePath: 'src/math.ts', changedLines: [4, 5], uncoveredLines: [5], status: 'uncovered' },
    ]);
  });

  it('treats every changed line as uncovered when the file has no coverage-map entry at all', () => {
    const results = computeCoverageFileResults({}, { 'src/never-run.ts': [10, 11] }, repoRoot);

    expect(results).toEqual([
      {
        filePath: 'src/never-run.ts',
        changedLines: [10, 11],
        uncoveredLines: [10, 11],
        status: 'uncovered',
      },
    ]);
  });

  it('marks a file covered when every changed line has hits', () => {
    const absolutePath = join(repoRoot, 'src/math.ts');
    const coverage = fixtureCoverage(absolutePath, [{ line: 4, hits: 1 }]);

    const results = computeCoverageFileResults(coverage, { 'src/math.ts': [4] }, repoRoot);

    expect(results).toEqual([
      { filePath: 'src/math.ts', changedLines: [4], uncoveredLines: [], status: 'covered' },
    ]);
  });

  it('skips non-source changed files entirely (test files, docs, config)', () => {
    const results = computeCoverageFileResults(
      {},
      { 'src/math.test.ts': [1, 2], 'README.md': [1], 'src/math.ts': [] },
      repoRoot,
    );

    expect(results).toEqual([]);
  });
});
