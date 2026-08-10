import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import {
  FakeGitCheckoutProvider,
  InMemoryCoverageFileResultRepository,
  InMemoryCoverageRunRepository,
  InMemoryRepoRepository,
} from './testing/index.js';
import { RunCoverageGateUseCase } from './run-coverage-gate.use-case.js';

const execFileAsync = promisify(execFile);
const REPO_TOKEN_KEY = randomBytes(32);

/**
 * Real end to end (project convention: no mocking) — a real git repo, a
 * real Jest run with real coverage collection, via the actual
 * `@cqp/coverage-engine` package. Zero LLM anywhere in this flow.
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** jest is a devDependency of @cqp/coverage-engine, not this package — resolve through it directly. */
function findRealJestPath(): string {
  return join(packageRoot, '..', 'coverage-engine', 'node_modules', 'jest', 'bin', 'jest.js');
}

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const coverageRunRepository = new InMemoryCoverageRunRepository();
  const coverageFileResultRepository = new InMemoryCoverageFileResultRepository();

  const checkoutProvider = new FakeGitCheckoutProvider();
  const useCase = new RunCoverageGateUseCase(
    coverageRunRepository,
    repoRepository,
    coverageFileResultRepository,
    checkoutProvider,
    REPO_TOKEN_KEY,
  );

  return {
    repoRepository,
    coverageRunRepository,
    coverageFileResultRepository,
    checkoutProvider,
    useCase,
  };
}

describe('RunCoverageGateUseCase', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoRoot });

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-run-coverage-gate-'));
    process.env.CQP_JEST_PATH = findRealJestPath();
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

  it('runs the real gate end to end and persists a failing verdict for an uncovered changed line', async () => {
    const { repoRepository, coverageRunRepository, coverageFileResultRepository, useCase } =
      await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });

    // Uncommitted edit adding an untested function.
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\n\nfunction subtract(a, b) {\n  return a - b;\n}\n\nmodule.exports = { add, subtract };\n',
    );

    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });
    await useCase.execute('org_1', run.id);

    const completed = await coverageRunRepository.findById('org_1', run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.gatePassed).toBe(false);
    expect(completed?.uncoveredLinesTotal).toBeGreaterThan(0);

    const fileResults = await coverageFileResultRepository.listByRun(run.id);
    expect(fileResults.find((f) => f.filePath === 'math.js')?.status).toBe('uncovered');
  }, 30000);

  it('rejects an unknown runId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-run')).rejects.toThrow('CoverageRun not found');
  });

  it('rejects an unknown repoId', async () => {
    const { coverageRunRepository, useCase } = await setUp();
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: 'no-such-repo',
      baseRef: 'main',
    });
    await expect(useCase.execute('org_1', run.id)).rejects.toThrow('Repo not found');
  });

  it('fails clearly when the repo has no local checkout', async () => {
    const { repoRepository, coverageRunRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' });
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });

    await expect(useCase.execute('org_1', run.id)).rejects.toThrow('no local checkout');

    const failed = await coverageRunRepository.findById('org_1', run.id);
    expect(failed?.status).toBe('failed');
  });

  it('fails clearly when baseRef does not resolve in the local checkout (docs/adr/0031: no longer validated at creation time)', async () => {
    const { repoRepository, coverageRunRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'no-such-branch',
    });

    await expect(useCase.execute('org_1', run.id)).rejects.toThrow();

    const failed = await coverageRunRepository.findById('org_1', run.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.errorMessage).toBeTruthy();
  });

  it('cleans up the checkout after a github repo run', async () => {
    const { repoRepository, coverageRunRepository, checkoutProvider, useCase } = await setUp();
    checkoutProvider.repoRoot = repoRoot;
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'demo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/demo.git',
    });
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });

    await useCase.execute('org_1', run.id);

    expect(checkoutProvider.checkoutCalls).toHaveLength(1);
    expect(checkoutProvider.cleanupCalls).toBe(1);
  }, 30000);

  it('never starts a run that was already cancelled while queued', async () => {
    const { repoRepository, coverageRunRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });
    await coverageRunRepository.updateStatus('org_1', run.id, 'cancelled');

    await useCase.execute('org_1', run.id);

    const stillCancelled = await coverageRunRepository.findById('org_1', run.id);
    expect(stillCancelled?.status).toBe('cancelled');
  });
});
