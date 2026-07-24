import { describe, expect, it } from 'vitest';
import { InMemoryScanRepository } from './testing/in-memory-scan-repository.js';
import { InMemoryRepoRepository } from './testing/in-memory-repo-repository.js';
import { InMemoryScanQueueRegistry } from './testing/in-memory-scan-queue.js';
import { CreateScanUseCase } from './create-scan.use-case.js';
import { GetScanUseCase, ScanNotFoundError } from './get-scan.use-case.js';

async function createScan(scanRepository: InMemoryScanRepository, orgId: string) {
  const repoRepository = new InMemoryRepoRepository();
  const repo = await repoRepository.create({ orgId, name: 'demo-repo' });
  return new CreateScanUseCase(
    scanRepository,
    repoRepository,
    new InMemoryScanQueueRegistry(),
  ).execute({
    orgId,
    repoId: repo.id,
    ref: 'main',
    mode: 'full',
  });
}

describe('GetScanUseCase', () => {
  it('returns a previously created scan', async () => {
    const repository = new InMemoryScanRepository();
    const created = await createScan(repository, 'org_1');

    const found = await new GetScanUseCase(repository).execute('org_1', created.id);

    expect(found.id).toBe(created.id);
  });

  it('throws ScanNotFoundError for an unknown id', async () => {
    const useCase = new GetScanUseCase(new InMemoryScanRepository());

    await expect(useCase.execute('org_1', 'does-not-exist')).rejects.toThrow(ScanNotFoundError);
  });

  it('throws ScanNotFoundError when the scan belongs to a different org', async () => {
    const repository = new InMemoryScanRepository();
    const created = await createScan(repository, 'org_1');

    await expect(new GetScanUseCase(repository).execute('org_2', created.id)).rejects.toThrow(
      ScanNotFoundError,
    );
  });
});
