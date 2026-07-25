import { describe, expect, it } from 'vitest';
import { InMemoryCronRunRepository } from './testing/in-memory-cron-run-repository.js';
import { ListCronRunsUseCase } from './list-cron-runs.use-case.js';

describe('ListCronRunsUseCase', () => {
  it('lists runs for the given org only, paginated', async () => {
    const cronRunRepository = new InMemoryCronRunRepository();
    const useCase = new ListCronRunsUseCase(cronRunRepository);
    await cronRunRepository.create({
      orgId: 'org_1',
      cronId: 'cod-candidate-search',
      cronName: 'Get COD Candidates',
      environment: 'dev',
    });
    await cronRunRepository.create({
      orgId: 'org_2',
      cronId: 'cod-candidate-search',
      cronName: 'Get COD Candidates',
      environment: 'dev',
    });

    const result = await useCase.execute('org_1', { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
    expect(result.data[0]?.orgId).toBe('org_1');
  });
});
