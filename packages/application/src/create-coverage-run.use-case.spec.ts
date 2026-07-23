import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  InMemoryCoverageQueue,
  InMemoryCoverageRunRepository,
  InMemoryRepoRepository,
} from './testing/index.js';
import { BaseRefNotFoundError, CreateCoverageRunUseCase } from './create-coverage-run.use-case.js';

const execFileAsync = promisify(execFile);

/** Real git repo (project convention: no mocking) — needed since base-ref validation shells out to real `git rev-parse`. */
describe('CreateCoverageRunUseCase', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-create-coverage-run-'));
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoRoot });
    await git('init', '--quiet');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');
    await writeFile(join(repoRoot, 'a.txt'), 'a\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'base');
    await git('branch', 'main');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  async function setUp() {
    const repoRepository = new InMemoryRepoRepository();
    const coverageRunRepository = new InMemoryCoverageRunRepository();
    const coverageQueue = new InMemoryCoverageQueue();
    const useCase = new CreateCoverageRunUseCase(
      coverageRunRepository,
      repoRepository,
      coverageQueue,
    );
    return { repoRepository, coverageRunRepository, coverageQueue, useCase };
  }

  it('resolves an omitted baseRef to the repo defaultBranch, creates the run, and enqueues it', async () => {
    const { repoRepository, coverageRunRepository, coverageQueue, useCase } = await setUp();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'demo',
      localPath: repoRoot,
      defaultBranch: 'main',
    });

    const run = await useCase.execute({ orgId: 'org_1', repoId: repo.id });

    expect(run.baseRef).toBe('main');
    expect(run.status).toBe('queued');
    expect(await coverageRunRepository.findById('org_1', run.id)).not.toBeNull();
    expect(coverageQueue.enqueued).toEqual([{ orgId: 'org_1', runId: run.id }]);
  });

  it('accepts an explicit baseRef that resolves locally', async () => {
    const { repoRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });

    const run = await useCase.execute({ orgId: 'org_1', repoId: repo.id, baseRef: 'HEAD' });
    expect(run.baseRef).toBe('HEAD');
  });

  it('rejects a baseRef that does not resolve in the local checkout, before enqueueing anything', async () => {
    const { repoRepository, coverageQueue, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });

    await expect(
      useCase.execute({ orgId: 'org_1', repoId: repo.id, baseRef: 'no-such-branch' }),
    ).rejects.toThrow(BaseRefNotFoundError);
    expect(coverageQueue.enqueued).toHaveLength(0);
  });

  it('rejects an unknown repoId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute({ orgId: 'org_1', repoId: 'no-such-repo' })).rejects.toThrow(
      'Repo not found',
    );
  });

  it('rejects a repo with no local checkout', async () => {
    const { repoRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' });
    await expect(useCase.execute({ orgId: 'org_1', repoId: repo.id })).rejects.toThrow(
      'no local checkout',
    );
  });
});
