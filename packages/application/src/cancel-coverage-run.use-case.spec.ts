import { describe, expect, it } from 'vitest';
import {
  InMemoryCoverageQueueRegistry,
  InMemoryCoverageRunRepository,
  InMemoryRepoRepository,
} from './testing/index.js';
import { CancelCoverageRunUseCase } from './cancel-coverage-run.use-case.js';

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const coverageRunRepository = new InMemoryCoverageRunRepository();
  const coverageQueueRegistry = new InMemoryCoverageQueueRegistry();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const coverageQueue = coverageQueueRegistry.forWorker(repo.workerId);
  const useCase = new CancelCoverageRunUseCase(
    coverageRunRepository,
    repoRepository,
    coverageQueueRegistry,
  );
  return { repo, coverageRunRepository, coverageQueue, useCase };
}

describe('CancelCoverageRunUseCase', () => {
  it('cancels a queued run and removes its queued job', async () => {
    const { repo, coverageRunRepository, coverageQueue, useCase } = await setUp();
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });
    await coverageQueue.enqueue({ orgId: 'org_1', runId: run.id });

    const cancelled = await useCase.execute('org_1', run.id);

    expect(cancelled.status).toBe('cancelled');
    expect(coverageQueue.cancelled).toContain(run.id);
  });

  it('is a no-op for an already-terminal run', async () => {
    const { repo, coverageRunRepository, useCase } = await setUp();
    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });
    await coverageRunRepository.updateStatus('org_1', run.id, 'completed');

    const result = await useCase.execute('org_1', run.id);
    expect(result.status).toBe('completed');
  });

  it('rejects an unknown runId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-run')).rejects.toThrow('not found');
  });

  it("cancels through the repo's own workerId queue, not some other worker's", async () => {
    const repoRepository = new InMemoryRepoRepository();
    const coverageRunRepository = new InMemoryCoverageRunRepository();
    const coverageQueueRegistry = new InMemoryCoverageQueueRegistry();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'laptop-repo',
      workerId: 'keshav-laptop',
    });
    const useCase = new CancelCoverageRunUseCase(
      coverageRunRepository,
      repoRepository,
      coverageQueueRegistry,
    );

    const run = await coverageRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      baseRef: 'main',
    });
    const laptopQueue = coverageQueueRegistry.forWorker('keshav-laptop');
    const defaultQueue = coverageQueueRegistry.forWorker('default');
    await laptopQueue.enqueue({ orgId: 'org_1', runId: run.id });

    await useCase.execute('org_1', run.id);

    expect(laptopQueue.cancelled).toContain(run.id);
    expect(defaultQueue.cancelled).toHaveLength(0);
  });
});
