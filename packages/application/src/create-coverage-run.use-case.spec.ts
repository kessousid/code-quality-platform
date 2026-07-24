import { describe, expect, it } from 'vitest';
import {
  InMemoryCoverageQueueRegistry,
  InMemoryCoverageRunRepository,
  InMemoryRepoRepository,
} from './testing/index.js';
import { CreateCoverageRunUseCase } from './create-coverage-run.use-case.js';

/**
 * docs/adr/0031: base-ref resolution is no longer checked here — it can't
 * be, once a repo's worker may be a different machine than this use case
 * runs on. `RunCoverageGateUseCase`'s own spec covers a bad baseRef
 * failing clearly on the worker side instead.
 */
function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const coverageRunRepository = new InMemoryCoverageRunRepository();
  const coverageQueueRegistry = new InMemoryCoverageQueueRegistry();
  const useCase = new CreateCoverageRunUseCase(
    coverageRunRepository,
    repoRepository,
    coverageQueueRegistry,
  );
  return { repoRepository, coverageRunRepository, coverageQueueRegistry, useCase };
}

describe('CreateCoverageRunUseCase', () => {
  it('resolves an omitted baseRef to the repo defaultBranch, creates the run, and enqueues it', async () => {
    const { repoRepository, coverageRunRepository, coverageQueueRegistry, useCase } = setUp();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'demo',
      localPath: '/repo',
      defaultBranch: 'main',
    });

    const run = await useCase.execute({ orgId: 'org_1', repoId: repo.id });

    expect(run.baseRef).toBe('main');
    expect(run.status).toBe('queued');
    expect(await coverageRunRepository.findById('org_1', run.id)).not.toBeNull();
    expect(coverageQueueRegistry.forWorker('default').enqueued).toEqual([
      { orgId: 'org_1', runId: run.id },
    ]);
  });

  it('accepts an explicit baseRef without validating it — that happens on the worker instead', async () => {
    const { repoRepository, useCase } = setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: '/repo' });

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'whatever-branch',
    });
    expect(run.baseRef).toBe('whatever-branch');
  });

  it('rejects an unknown repoId', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute({ orgId: 'org_1', repoId: 'no-such-repo' })).rejects.toThrow(
      'Repo not found',
    );
  });

  it('rejects a repo with no local checkout', async () => {
    const { repoRepository, useCase } = setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' });
    await expect(useCase.execute({ orgId: 'org_1', repoId: repo.id })).rejects.toThrow(
      'no local checkout',
    );
  });

  it("enqueues through the repo's own workerId queue, not the default one", async () => {
    const { repoRepository, coverageQueueRegistry, useCase } = setUp();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'laptop-repo',
      localPath: '/repo',
      workerId: 'keshav-laptop',
    });

    const run = await useCase.execute({ orgId: 'org_1', repoId: repo.id });

    expect(coverageQueueRegistry.forWorker('keshav-laptop').enqueued).toEqual([
      { orgId: 'org_1', runId: run.id },
    ]);
    expect(coverageQueueRegistry.forWorker('default').enqueued).toHaveLength(0);
  });
});
