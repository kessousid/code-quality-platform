import { describe, expect, it } from 'vitest';
import { InMemoryCronRunRepository } from './testing/in-memory-cron-run-repository.js';
import { InMemoryCronExecutor } from './testing/in-memory-cron-executor.js';
import { CronNotFoundError, TriggerCronRunUseCase } from './trigger-cron-run.use-case.js';

function setup() {
  const cronRunRepository = new InMemoryCronRunRepository();
  const cronExecutor = new InMemoryCronExecutor();
  const useCase = new TriggerCronRunUseCase(cronRunRepository, cronExecutor);
  return { useCase, cronRunRepository, cronExecutor };
}

describe('TriggerCronRunUseCase', () => {
  it('rejects an unknown cronId without creating any run row', async () => {
    const { useCase, cronRunRepository } = setup();

    await expect(
      useCase.execute({ orgId: 'org_1', cronId: 'does-not-exist', environment: 'dev' }),
    ).rejects.toThrow(CronNotFoundError);

    const { data } = await cronRunRepository.list('org_1', { page: 1, pageSize: 25 });
    expect(data).toHaveLength(0);
  });

  it('marks the run succeeded for a 2xx executor response', async () => {
    const { useCase, cronExecutor } = setup();
    cronExecutor.result = { statusCode: 200, body: '{"ok":true}' };

    const run = await useCase.execute({
      orgId: 'org_1',
      cronId: 'cod-candidate-search',
      environment: 'dev',
    });

    expect(run.status).toBe('succeeded');
    expect(run.statusCode).toBe(200);
    expect(run.responseBody).toBe('{"ok":true}');
    expect(run.errorMessage).toBeUndefined();
    expect(run.cronName).toBe('Get COD Candidates');
    expect(run.completedAt).toBeInstanceOf(Date);
  });

  it('marks the run failed (with the statusCode, no errorMessage) for a non-2xx executor response', async () => {
    const { useCase, cronExecutor } = setup();
    cronExecutor.result = { statusCode: 500, body: '{"error":"boom"}' };

    const run = await useCase.execute({
      orgId: 'org_1',
      cronId: 'cod-candidate-search',
      environment: 'dev',
    });

    expect(run.status).toBe('failed');
    expect(run.statusCode).toBe(500);
    expect(run.responseBody).toBe('{"error":"boom"}');
    expect(run.errorMessage).toBeUndefined();
  });

  it('marks the run failed (with errorMessage, no statusCode) when the executor throws', async () => {
    const { useCase, cronExecutor } = setup();
    cronExecutor.error = new Error('Failed to reach https://curatal-dev.openturf.dev: ENOTFOUND');

    const run = await useCase.execute({
      orgId: 'org_1',
      cronId: 'cod-candidate-search',
      environment: 'dev',
    });

    expect(run.status).toBe('failed');
    expect(run.statusCode).toBeUndefined();
    expect(run.errorMessage).toContain('ENOTFOUND');
  });

  it('calls the executor with the right definition and base URL for the chosen environment', async () => {
    const { useCase, cronExecutor } = setup();

    await useCase.execute({
      orgId: 'org_1',
      cronId: 'candidate-outreach',
      environment: 'staging',
    });

    expect(cronExecutor.calls).toEqual([
      {
        definition: {
          id: 'candidate-outreach',
          name: 'Candidate Outreach CRON',
          path: '/api/v1/outreach/trigger',
        },
        baseUrl: 'https://staging.curatal.com',
      },
    ]);
  });

  it('resolves the interview-service cron (July 2026 re-export) to the same per-environment base URLs as every other cron', async () => {
    const { useCase, cronExecutor } = setup();

    await useCase.execute({
      orgId: 'org_1',
      cronId: 'cod-interviewed-candidate',
      environment: 'dev',
    });

    expect(cronExecutor.calls).toEqual([
      {
        definition: {
          id: 'cod-interviewed-candidate',
          name: 'cod-interviewed-candidate',
          path: '/api/v1/cron/cod/assigncandidate/interviewed-candidates',
        },
        baseUrl: 'https://curatal-dev.openturf.dev',
      },
    ]);
  });
});
