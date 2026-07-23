import { describe, expect, it } from 'vitest';
import { InMemoryRepoRepository, InMemoryScanRepository } from './testing/index.js';
import { ListScansByRepoUseCase } from './list-scans-by-repo.use-case.js';

describe('ListScansByRepoUseCase', () => {
  it('lists a repo scans newest first, scoped to org and repo', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const scanRepository = new InMemoryScanRepository();
    const repoA = await repoRepository.create({ orgId: 'org_1', name: 'a' });
    const repoB = await repoRepository.create({ orgId: 'org_1', name: 'b' });

    const s1 = await scanRepository.create({
      orgId: 'org_1',
      repoId: repoA.id,
      ref: 'main',
      mode: 'full',
    });
    await new Promise((r) => setTimeout(r, 2));
    const s2 = await scanRepository.create({
      orgId: 'org_1',
      repoId: repoA.id,
      ref: 'main',
      mode: 'full',
    });
    await scanRepository.create({ orgId: 'org_1', repoId: repoB.id, ref: 'main', mode: 'full' });

    const useCase = new ListScansByRepoUseCase(scanRepository);
    const result = await useCase.execute('org_1', repoA.id, { page: 1, pageSize: 25 });

    expect(result.total).toBe(2);
    expect(result.data.map((s) => s.id)).toEqual([s2.id, s1.id]);
  });
});
