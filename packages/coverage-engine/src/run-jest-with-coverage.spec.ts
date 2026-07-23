import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJestWithCoverage } from './run-jest-with-coverage.js';

/** Real jest execution (project convention: no mocking) — CQP_JEST_PATH points at this package's own jest, since the temp repo below has no node_modules of its own. */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_JEST_PATH = join(packageRoot, 'node_modules', 'jest', 'bin', 'jest.js');

describe('runJestWithCoverage', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-coverage-jest-'));
    process.env.CQP_JEST_PATH = REAL_JEST_PATH;
    await writeFile(join(repoRoot, 'package.json'), '{"name":"tmp-fixture"}');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    if (originalJestPath === undefined) {
      delete process.env.CQP_JEST_PATH;
    } else {
      process.env.CQP_JEST_PATH = originalJestPath;
    }
  });

  it("runs the repo's own existing suite with real coverage collection", async () => {
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nfunction subtract(a, b) {\n  return a - b;\n}\n\nmodule.exports = { add, subtract };\n',
    );
    await writeFile(
      join(repoRoot, 'math.test.js'),
      "const { add } = require('./math');\ndescribe('add', () => {\n  it('adds two numbers', () => {\n    expect(add(1, 1)).toBe(2);\n  });\n});\n",
    );

    const result = await runJestWithCoverage(repoRoot, false);

    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
    expect(result.coverageFinalJson).not.toBeNull();
    const mathFileKey = Object.keys(result.coverageFinalJson!).find((k) => k.endsWith('math.js'));
    expect(mathFileKey).toBeDefined();
  }, 30000);

  it('returns a legitimate zero-coverage result (not a crash) when the repo has no tests at all', async () => {
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n',
    );

    const result = await runJestWithCoverage(repoRoot, false);

    expect(result.testsTotal).toBe(0);
    expect(result.testsPassed).toBe(0);
    expect(result.testsFailed).toBe(0);
  }, 30000);
});
