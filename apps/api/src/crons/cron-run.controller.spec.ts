import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ListCronRunsUseCase, TriggerCronRunUseCase } from '@cqp/application';
import { InMemoryCronExecutor, InMemoryCronRunRepository } from '@cqp/application/testing';
import { CronRunController } from './cron-run.controller.js';

/** Proves the vertical slice (ADR-0010) end-to-end through real NestJS DI, without touching Prisma or a real HTTP call — see docs/adr/0033. */
async function buildTestingModule() {
  const cronRunRepository = new InMemoryCronRunRepository();
  const cronExecutor = new InMemoryCronExecutor();

  const moduleRef = await Test.createTestingModule({
    controllers: [CronRunController],
    providers: [
      {
        provide: TriggerCronRunUseCase,
        useValue: new TriggerCronRunUseCase(cronRunRepository, cronExecutor),
      },
      { provide: ListCronRunsUseCase, useValue: new ListCronRunsUseCase(cronRunRepository) },
    ],
  }).compile();

  return { controller: moduleRef.get(CronRunController), cronRunRepository, cronExecutor };
}

describe('CronRunController', () => {
  it('triggers a known cron and returns the completed run', async () => {
    const { controller, cronExecutor } = await buildTestingModule();
    cronExecutor.result = { statusCode: 200, body: '{"ok":true}' };

    const run = await controller.trigger('org_1', {
      cronId: 'cod-candidate-search',
      environment: 'dev',
    });

    expect(run.status).toBe('succeeded');
    expect(run.cronName).toBe('Get COD Candidates');
  });

  it('404s a trigger request for an unknown cronId', async () => {
    const { controller } = await buildTestingModule();

    await expect(
      controller.trigger('org_1', { cronId: 'does-not-exist', environment: 'dev' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists runs for the current org only, paginated', async () => {
    const { controller } = await buildTestingModule();
    await controller.trigger('org_1', { cronId: 'cod-candidate-search', environment: 'dev' });

    const result = await controller.list('org_1', { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
    expect(result.data[0]?.cronId).toBe('cod-candidate-search');
  });
});
