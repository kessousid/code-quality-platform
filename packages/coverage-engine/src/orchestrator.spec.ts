import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runCoverageGate } from './orchestrator.js';

const execFileAsync = promisify(execFile);

/** Real git repo + real jest execution end to end (project convention: no mocking). */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_JEST_PATH = join(packageRoot, 'node_modules', 'jest', 'bin', 'jest.js');

describe('runCoverageGate', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoRoot });

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-coverage-orchestrator-'));
    process.env.CQP_JEST_PATH = REAL_JEST_PATH;
    await writeFile(join(repoRoot, 'package.json'), '{"name":"tmp-fixture"}');

    await git('init', '--quiet');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');

    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nmodule.exports = { add };\n',
    );
    await writeFile(
      join(repoRoot, 'math.test.js'),
      "const { add } = require('./math');\ndescribe('add', () => {\n  it('adds', () => {\n    expect(add(1, 1)).toBe(2);\n  });\n});\n",
    );
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'base');
    await git('branch', 'main');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    if (originalJestPath === undefined) {
      delete process.env.CQP_JEST_PATH;
    } else {
      process.env.CQP_JEST_PATH = originalJestPath;
    }
  });

  it('flips gatePassed from false to true once a test is added for a previously-uncovered changed line', async () => {
    // Uncommitted edit adding an untested function — the gate must see this via the working tree, not a commit.
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nfunction subtract(a, b) {\n  return a - b;\n}\n\nmodule.exports = { add, subtract };\n',
    );

    const firstRun = await runCoverageGate(repoRoot, 'main');
    expect(firstRun.gatePassed).toBe(false);
    expect(firstRun.uncoveredLinesTotal).toBeGreaterThan(0);
    const mathResult = firstRun.fileResults.find((f) => f.filePath === 'math.js');
    expect(mathResult?.status).toBe('uncovered');

    // Now add a test covering the previously-uncovered line (still uncommitted — working tree is what's diffed either way).
    await writeFile(
      join(repoRoot, 'math.test.js'),
      "const { add, subtract } = require('./math');\ndescribe('math', () => {\n  it('adds', () => {\n    expect(add(1, 1)).toBe(2);\n  });\n  it('subtracts', () => {\n    expect(subtract(3, 1)).toBe(2);\n  });\n});\n",
    );

    const secondRun = await runCoverageGate(repoRoot, 'main');
    expect(secondRun.gatePassed).toBe(true);
    expect(secondRun.uncoveredLinesTotal).toBe(0);
  }, 30000);

  it('gate fails when a covering test exists but is currently failing', async () => {
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nfunction subtract(a, b) {\n  return a - b;\n}\n\nmodule.exports = { add, subtract };\n',
    );
    await writeFile(
      join(repoRoot, 'math.test.js'),
      "const { add, subtract } = require('./math');\ndescribe('math', () => {\n  it('adds', () => {\n    expect(add(1, 1)).toBe(2);\n  });\n  it('subtracts', () => {\n    expect(subtract(3, 1)).toBe(999);\n  });\n});\n",
    );

    const result = await runCoverageGate(repoRoot, 'main');

    expect(result.testsFailed).toBeGreaterThan(0);
    expect(result.uncoveredLinesTotal).toBe(0); // the line WAS executed...
    expect(result.gatePassed).toBe(false); // ...but the gate still fails because the covering test is red
  }, 30000);
});
