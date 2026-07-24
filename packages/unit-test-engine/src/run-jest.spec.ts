import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoTestsFoundError, runJest } from './run-jest.js';
import { ToolNotFoundError } from '@cqp/plugin-shared';

/** Real jest execution (project convention: no mocking) — CQP_JEST_PATH points at this package's own jest, since the temp repo below has no node_modules of its own. */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_JEST_PATH = join(packageRoot, 'node_modules', 'jest', 'bin', 'jest.js');

describe('runJest', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-run-jest-'));
    process.env.CQP_JEST_PATH = REAL_JEST_PATH;
    // Jest refuses to run at all with no package.json/config anywhere above cwd — every real target project has one; this fixture just needs to look like one.
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

  it('runs a real generated test file and reports pass/fail per test case', async () => {
    const testFile = join(repoRoot, 'sample.generated.test.js');
    await writeFile(
      testFile,
      `
      describe('add', () => {
        it('adds two numbers', () => {
          expect(1 + 1).toBe(2);
        });
        it('fails on purpose', () => {
          expect(1 + 1).toBe(3);
        });
      });
      `,
    );

    const result = await runJest(repoRoot, [testFile]);

    expect(result.testsTotal).toBe(2);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(1);
    const passed = result.results.find((r) => r.testName === 'adds two numbers');
    const failed = result.results.find((r) => r.testName === 'fails on purpose');
    expect(passed?.status).toBe('passed');
    expect(failed?.status).toBe('failed');
    expect(failed?.failureMessage).toContain('Expected');
  }, 30000);

  it('throws NoTestsFoundError when the generated file matches nothing runnable', async () => {
    const testFile = join(repoRoot, 'empty.generated.test.js');
    await writeFile(testFile, `describe.skip('nothing', () => { it('skipped', () => {}); });`);

    // jest still "finds" a skipped test (numTotalTests > 0), so use a file with no test() calls at all instead.
    const trulyEmptyFile = join(repoRoot, 'no-tests.generated.test.js');
    await writeFile(trulyEmptyFile, `// no tests here`);

    await expect(runJest(repoRoot, [trulyEmptyFile])).rejects.toThrow(NoTestsFoundError);
    // clean up the unused fixture reference to keep the test file honest
    void testFile;
  }, 30000);

  it('surfaces a clear ToolNotFoundError when jest cannot be resolved at all', async () => {
    process.env.CQP_JEST_PATH = join(repoRoot, 'definitely-not-a-real-jest-binary.exe');
    const testFile = join(repoRoot, 'sample.generated.test.js');
    await writeFile(testFile, `it('x', () => { expect(true).toBe(true); });`);

    await expect(runJest(repoRoot, [testFile])).rejects.toThrow(ToolNotFoundError);
  });

  it('auto-installs jest as a real devDependency when the target has none, then runs the test for real (zero manual setup)', async () => {
    delete process.env.CQP_JEST_PATH;
    const testFile = join(repoRoot, 'sample.generated.test.js');
    await writeFile(testFile, `it('adds', () => { expect(1 + 1).toBe(2); });`);

    const result = await runJest(repoRoot, [testFile]);

    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(existsSync(join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js'))).toBe(true);
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf-8'));
    expect(packageJson.devDependencies?.jest).toBeDefined();
  }, 120_000);

  it('also installs the babel TypeScript preset and writes a babel.config.cjs for a .ts target with no config of its own', async () => {
    delete process.env.CQP_JEST_PATH;
    const testFile = join(repoRoot, 'sample.generated.test.ts');
    await writeFile(testFile, `it('adds', () => { const x: number = 1; expect(x + 1).toBe(2); });`);

    const result = await runJest(repoRoot, [testFile]);

    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(existsSync(join(repoRoot, 'babel.config.cjs'))).toBe(true);
    expect(existsSync(join(repoRoot, 'node_modules', '@babel', 'preset-typescript'))).toBe(true);
  }, 120_000);

  it('names the real cause when repoRoot has no package.json — npm silently hoisting to a parent project, not jest being broken', async () => {
    delete process.env.CQP_JEST_PATH;
    await rm(join(repoRoot, 'package.json'));
    // A fake "npm" that reports success without installing anything — reproducing the real, live-observed case where the actual npm walked up to an ancestor package.json instead of repoRoot, leaving repoRoot's own node_modules untouched.
    const fakeNpm = join(repoRoot, 'fake-npm.js');
    await writeFile(fakeNpm, 'process.exit(0);');
    process.env.CQP_NPM_PATH = fakeNpm;
    const testFile = join(repoRoot, 'sample.generated.test.js');
    await writeFile(testFile, `it('x', () => { expect(true).toBe(true); });`);

    try {
      await expect(runJest(repoRoot, [testFile])).rejects.toThrow(/no package\.json found/i);
    } finally {
      delete process.env.CQP_NPM_PATH;
    }
  });

  it('surfaces a clear ToolNotFoundError for npm itself when auto-install has no way to run', async () => {
    delete process.env.CQP_JEST_PATH;
    process.env.CQP_NPM_PATH = join(repoRoot, 'definitely-not-a-real-npm.exe');
    const testFile = join(repoRoot, 'sample.generated.test.js');
    await writeFile(testFile, `it('x', () => { expect(true).toBe(true); });`);

    try {
      await expect(runJest(repoRoot, [testFile])).rejects.toThrow(ToolNotFoundError);
    } finally {
      delete process.env.CQP_NPM_PATH;
    }
  });
});
