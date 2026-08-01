import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { QaAutomationJobData } from '@cqp/queue';
import {
  GetQaAutomationRunUseCase,
  GetQaAutomationScheduleUseCase,
  ListQaAutomationRunsUseCase,
  UpdateQaAutomationScheduleUseCase,
} from '@cqp/application';
import {
  InMemoryQaAutomationRunRepository,
  InMemoryQaAutomationScheduleRepository,
  InMemoryQaAutomationTestResultRepository,
} from '@cqp/application/testing';
import { QaAutomationController } from './qa-automation.controller.js';
import { QA_AUTOMATION_QUEUE } from '../tokens.js';

/**
 * A call-recording fake, not a real BullMQ Queue — the real repeatable-job
 * behavior (upsertJobScheduler/removeJobScheduler against real Redis) is
 * covered by qa-automation-queue.spec.ts; this test proves the controller
 * picks the right queue call based on `enabled`, which doesn't need Redis.
 */
function fakeQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue<QaAutomationJobData>;
}

async function buildTestingModule() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const scheduleRepository = new InMemoryQaAutomationScheduleRepository();
  const queue = fakeQueue();

  const moduleRef = await Test.createTestingModule({
    controllers: [QaAutomationController],
    providers: [
      {
        provide: GetQaAutomationScheduleUseCase,
        useValue: new GetQaAutomationScheduleUseCase(scheduleRepository),
      },
      {
        provide: UpdateQaAutomationScheduleUseCase,
        useValue: new UpdateQaAutomationScheduleUseCase(scheduleRepository),
      },
      {
        provide: ListQaAutomationRunsUseCase,
        useValue: new ListQaAutomationRunsUseCase(runRepository),
      },
      {
        provide: GetQaAutomationRunUseCase,
        useValue: new GetQaAutomationRunUseCase(runRepository, resultRepository),
      },
      { provide: QA_AUTOMATION_QUEUE, useValue: queue },
    ],
  }).compile();

  return { controller: moduleRef.get(QaAutomationController), runRepository, queue };
}

describe('QaAutomationController', () => {
  it('returns the default schedule for a new org', async () => {
    const { controller } = await buildTestingModule();

    const schedule = await controller.getSchedule('org_1');

    expect(schedule.intervalHours).toBe(12);
    expect(schedule.enabled).toBe(true);
  });

  it('updating the interval while enabled upserts the job scheduler', async () => {
    const { controller, queue } = await buildTestingModule();

    const schedule = await controller.updateSchedule('org_1', { intervalHours: 6 });

    expect(schedule.intervalHours).toBe(6);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.stringContaining('org_1'),
      { every: 6 * 60 * 60 * 1000 },
      expect.anything(),
    );
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('disabling the schedule removes the job scheduler instead', async () => {
    const { controller, queue } = await buildTestingModule();

    await controller.updateSchedule('org_1', { enabled: false });

    expect(queue.removeJobScheduler).toHaveBeenCalled();
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('a manual trigger enqueues a job and returns queued', async () => {
    const { controller, queue } = await buildTestingModule();

    const result = await controller.triggerRun('org_1');

    expect(result).toEqual({ status: 'queued' });
    expect(queue.add).toHaveBeenCalledWith('run-qa-automation-suite', {
      orgId: 'org_1',
      triggeredBy: 'manual',
    });
  });

  it('404s a run lookup for an unknown id', async () => {
    const { controller } = await buildTestingModule();

    await expect(controller.getRun('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('lists runs for the current org only, paginated', async () => {
    const { controller, runRepository } = await buildTestingModule();
    await runRepository.create({ orgId: 'org_1', triggeredBy: 'manual' });

    const result = await controller.listRuns('org_1', { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
  });
});
