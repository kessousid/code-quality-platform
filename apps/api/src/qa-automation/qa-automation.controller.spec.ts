import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { QaAutomationJobData, QaAutomationStagingJobData } from '@cqp/queue';
import {
  GetQaAutomationRunUseCase,
  GetQaAutomationScheduleUseCase,
  GetQaAutomationStagingScheduleUseCase,
  ListQaAutomationRunsUseCase,
  UpdateQaAutomationScheduleUseCase,
  UpdateQaAutomationStagingScheduleUseCase,
} from '@cqp/application';
import {
  InMemoryQaAutomationRunRepository,
  InMemoryQaAutomationScheduleRepository,
  InMemoryQaAutomationStagingScheduleRepository,
  InMemoryQaAutomationTestResultRepository,
} from '@cqp/application/testing';
import { QaAutomationController } from './qa-automation.controller.js';
import { QA_AUTOMATION_QUEUE, QA_AUTOMATION_STAGING_QUEUE } from '../tokens.js';

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

function fakeStagingQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue<QaAutomationStagingJobData>;
}

async function buildTestingModule() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const scheduleRepository = new InMemoryQaAutomationScheduleRepository();
  const stagingScheduleRepository = new InMemoryQaAutomationStagingScheduleRepository();
  const queue = fakeQueue();
  const stagingQueue = fakeStagingQueue();

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
        provide: GetQaAutomationStagingScheduleUseCase,
        useValue: new GetQaAutomationStagingScheduleUseCase(stagingScheduleRepository),
      },
      {
        provide: UpdateQaAutomationStagingScheduleUseCase,
        useValue: new UpdateQaAutomationStagingScheduleUseCase(stagingScheduleRepository),
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
      { provide: QA_AUTOMATION_STAGING_QUEUE, useValue: stagingQueue },
    ],
  }).compile();

  return {
    controller: moduleRef.get(QaAutomationController),
    runRepository,
    queue,
    stagingQueue,
  };
}

describe('QaAutomationController', () => {
  it('returns the default schedule (enabled, no interval field) for a new org', async () => {
    const { controller } = await buildTestingModule();

    const schedule = await controller.getSchedule('org_1');

    expect(schedule).toEqual({ enabled: true });
  });

  it('re-enabling the schedule upserts the job scheduler on the fixed twice-daily cron', async () => {
    const { controller, queue } = await buildTestingModule();

    await controller.updateSchedule('org_1', { enabled: true });

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.stringContaining('org_1'),
      { pattern: '0 0,12 * * *', tz: 'Asia/Kolkata' },
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
    await runRepository.create({
      orgId: 'org_1',
      environment: 'production',
      triggeredBy: 'manual',
    });

    const result = await controller.listRuns('org_1', { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
  });

  it('defaults the run listing to production, excluding staging runs, when no environment filter is given', async () => {
    const { controller, runRepository } = await buildTestingModule();
    await runRepository.create({
      orgId: 'org_1',
      environment: 'production',
      triggeredBy: 'manual',
    });
    await runRepository.create({ orgId: 'org_1', environment: 'staging', triggeredBy: 'manual' });

    const result = await controller.listRuns('org_1', { page: 1, pageSize: 25 });

    expect(result.total).toBe(1);
  });

  it('lists only staging runs when environment=staging is requested', async () => {
    const { controller, runRepository } = await buildTestingModule();
    await runRepository.create({
      orgId: 'org_1',
      environment: 'production',
      triggeredBy: 'manual',
    });
    await runRepository.create({ orgId: 'org_1', environment: 'staging', triggeredBy: 'manual' });

    const result = await controller.listRuns('org_1', {
      page: 1,
      pageSize: 25,
      environment: 'staging',
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.environment).toBe('staging');
  });

  it('returns the default staging schedule (enabled, no interval field) for a new org', async () => {
    const { controller } = await buildTestingModule();

    const schedule = await controller.getStagingSchedule('org_1');

    expect(schedule).toEqual({ enabled: true });
  });

  it('disabling the staging schedule removes the staging job scheduler instead of upserting it', async () => {
    const { controller, stagingQueue } = await buildTestingModule();

    await controller.updateStagingSchedule('org_1', { enabled: false });

    expect(stagingQueue.removeJobScheduler).toHaveBeenCalled();
    expect(stagingQueue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('re-enabling the staging schedule upserts the staging job scheduler', async () => {
    const { controller, stagingQueue } = await buildTestingModule();

    await controller.updateStagingSchedule('org_1', { enabled: true });

    expect(stagingQueue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.stringContaining('org_1'),
      { pattern: '0 0 * * *', tz: 'Asia/Kolkata' },
      expect.anything(),
    );
    expect(stagingQueue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('a manual staging trigger enqueues a job onto the staging queue and returns queued', async () => {
    const { controller, stagingQueue } = await buildTestingModule();

    const result = await controller.triggerStagingRun('org_1');

    expect(result).toEqual({ status: 'queued' });
    expect(stagingQueue.add).toHaveBeenCalledWith('run-qa-automation-staging-suite', {
      orgId: 'org_1',
      triggeredBy: 'manual',
    });
  });
});
