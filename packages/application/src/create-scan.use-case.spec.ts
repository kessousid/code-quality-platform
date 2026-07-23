import { describe, expect, it } from 'vitest';
import { InMemoryScanRepository } from './testing/in-memory-scan-repository.js';
import { InMemoryRepoRepository } from './testing/in-memory-repo-repository.js';
import { InMemoryScanQueue } from './testing/in-memory-scan-queue.js';
import { CreateScanUseCase } from './create-scan.use-case.js';
import { RepoNotFoundError } from './get-repo.use-case.js';

async function setup() {
  const scanRepository = new InMemoryScanRepository();
  const repoRepository = new InMemoryRepoRepository();
  const scanQueue = new InMemoryScanQueue();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const useCase = new CreateScanUseCase(scanRepository, repoRepository, scanQueue);
  return { useCase, repo, repoRepository, scanQueue };
}

describe('CreateScanUseCase', () => {
  it('creates a queued full scan for an existing repo and enqueues it for the worker', async () => {
    const { useCase, repo, scanQueue } = await setup();

    const scan = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    expect(scan.status).toBe('queued');
    expect(scan.mode).toBe('full');
    expect(scan.id).toBeTruthy();
    // See docs/adr/0021 — creating a Scan row used to be the entire
    // effect; nothing told a worker to actually run it.
    expect(scanQueue.enqueued).toEqual([{ orgId: 'org_1', scanId: scan.id }]);
  });

  it('rejects an incremental scan without a baseScanId', async () => {
    const { useCase, repo } = await setup();

    await expect(
      useCase.execute({ orgId: 'org_1', repoId: repo.id, ref: 'main', mode: 'incremental' }),
    ).rejects.toThrow('An incremental scan requires a baseScanId');
  });

  it('accepts an incremental scan with a baseScanId', async () => {
    const { useCase, repo } = await setup();

    const scan = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'incremental',
      baseScanId: 'scan_prev',
    });

    expect(scan.baseScanId).toBe('scan_prev');
  });

  it('rejects a scan against a repoId that does not exist (Phase 5 gap, closed)', async () => {
    const { useCase } = await setup();

    await expect(
      useCase.execute({ orgId: 'org_1', repoId: 'does-not-exist', ref: 'main', mode: 'full' }),
    ).rejects.toThrow(RepoNotFoundError);
  });

  it('rejects a scan against a repo that belongs to a different org', async () => {
    const { useCase, repo } = await setup();

    await expect(
      useCase.execute({ orgId: 'org_2', repoId: repo.id, ref: 'main', mode: 'full' }),
    ).rejects.toThrow(RepoNotFoundError);
  });
});
