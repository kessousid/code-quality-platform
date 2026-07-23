import { describe, expect, it } from 'vitest';
import {
  InMemoryRepoRepository,
  InMemoryUnitTestQueue,
  InMemoryUnitTestRunRepository,
} from './testing/index.js';
import { CancelUnitTestRunUseCase } from './cancel-unit-test-run.use-case.js';

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const unitTestRunRepository = new InMemoryUnitTestRunRepository();
  const unitTestQueue = new InMemoryUnitTestQueue();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const useCase = new CancelUnitTestRunUseCase(unitTestRunRepository, unitTestQueue);
  return { repo, unitTestRunRepository, unitTestQueue, useCase };
}

describe('CancelUnitTestRunUseCase', () => {
  it('cancels a queued run and removes its queued job', async () => {
    const { repo, unitTestRunRepository, unitTestQueue, useCase } = await setUp();
    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'a.ts' },
    });
    await unitTestQueue.enqueue({ orgId: 'org_1', runId: run.id });

    const cancelled = await useCase.execute('org_1', run.id);

    expect(cancelled.status).toBe('cancelled');
    expect(unitTestQueue.cancelled).toContain(run.id);
  });

  it('is a no-op for an already-terminal run', async () => {
    const { repo, unitTestRunRepository, useCase } = await setUp();
    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'a.ts' },
    });
    await unitTestRunRepository.updateStatus('org_1', run.id, 'completed');

    const result = await useCase.execute('org_1', run.id);
    expect(result.status).toBe('completed');
  });

  it('rejects an unknown runId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-run')).rejects.toThrow('UnitTestRun not found');
  });
});
