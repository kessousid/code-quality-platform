import { describe, expect, it } from 'vitest';
import {
  InMemoryRepoRepository,
  InMemoryScanQueue,
  InMemoryScanRepository,
} from './testing/index.js';
import { CancelScanUseCase } from './cancel-scan.use-case.js';

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const scanRepository = new InMemoryScanRepository();
  const scanQueue = new InMemoryScanQueue();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const useCase = new CancelScanUseCase(scanRepository, scanQueue);
  return { repo, scanRepository, scanQueue, useCase };
}

describe('CancelScanUseCase', () => {
  it('cancels a queued scan and removes its queued job', async () => {
    const { repo, scanRepository, scanQueue, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await scanQueue.enqueue({ orgId: 'org_1', scanId: scan.id });

    const cancelled = await useCase.execute('org_1', scan.id);

    expect(cancelled.status).toBe('cancelled');
    expect(scanQueue.cancelled).toContain(scan.id);
    expect(scanQueue.enqueued).toHaveLength(0);
  });

  it('flips a running scan to cancelled without touching the queue', async () => {
    const { repo, scanRepository, scanQueue, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await scanRepository.updateStatus('org_1', scan.id, 'running');

    const cancelled = await useCase.execute('org_1', scan.id);

    expect(cancelled.status).toBe('cancelled');
    expect(scanQueue.cancelled).toHaveLength(0);
  });

  it('is a no-op for an already-terminal scan', async () => {
    const { repo, scanRepository, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await scanRepository.updateStatus('org_1', scan.id, 'running');
    await scanRepository.updateStatus('org_1', scan.id, 'completed');

    const result = await useCase.execute('org_1', scan.id);

    expect(result.status).toBe('completed');
  });

  it('rejects an unknown scanId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-scan')).rejects.toThrow('Scan not found');
  });
});
