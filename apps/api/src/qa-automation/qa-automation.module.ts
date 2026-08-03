import { Module } from '@nestjs/common';
import type {
  ObjectStorage,
  QaAutomationReportRepository,
  QaAutomationRunRepository,
  QaAutomationScheduleRepository,
  QaAutomationStagingScheduleRepository,
  QaAutomationTestResultRepository,
} from '@cqp/core';
import {
  GenerateQaAutomationReportUseCase,
  GetQaAutomationReportContentUseCase,
  GetQaAutomationReportUseCase,
  GetQaAutomationRunUseCase,
  GetQaAutomationScheduleUseCase,
  GetQaAutomationStagingScheduleUseCase,
  ListQaAutomationReportsByRunUseCase,
  ListQaAutomationRunsUseCase,
  UpdateQaAutomationScheduleUseCase,
  UpdateQaAutomationStagingScheduleUseCase,
} from '@cqp/application';
import {
  PrismaQaAutomationReportRepository,
  PrismaQaAutomationRunRepository,
  PrismaQaAutomationScheduleRepository,
  PrismaQaAutomationStagingScheduleRepository,
  PrismaQaAutomationTestResultRepository,
} from '@cqp/db';
import {
  createQaAutomationBullQueue,
  createQaAutomationStagingBullQueue,
  createRedisConnection,
} from '@cqp/queue';
import { LocalFilesystemObjectStorage } from '@cqp/storage';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  OBJECT_STORAGE,
  QA_AUTOMATION_QUEUE,
  QA_AUTOMATION_REPORT_REPOSITORY,
  QA_AUTOMATION_RUN_REPOSITORY,
  QA_AUTOMATION_SCHEDULE_REPOSITORY,
  QA_AUTOMATION_STAGING_QUEUE,
  QA_AUTOMATION_STAGING_SCHEDULE_REPOSITORY,
  QA_AUTOMATION_TEST_RESULT_REPOSITORY,
} from '../tokens.js';
import { QaAutomationController } from './qa-automation.controller.js';
import { QaAutomationReportController } from './qa-automation-report.controller.js';

@Module({
  controllers: [QaAutomationController, QaAutomationReportController],
  providers: [
    {
      provide: QA_AUTOMATION_RUN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaQaAutomationRunRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: QA_AUTOMATION_TEST_RESULT_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaQaAutomationTestResultRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: QA_AUTOMATION_SCHEDULE_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaQaAutomationScheduleRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // The real BullMQ producer Queue — apps/qa-automation consumes the
      // same queue name/job shape via @cqp/queue (see docs/adr/0035).
      provide: QA_AUTOMATION_QUEUE,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        return createQaAutomationBullQueue(createRedisConnection(redisUrl));
      },
    },
    {
      provide: GetQaAutomationScheduleUseCase,
      useFactory: (repo: QaAutomationScheduleRepository) =>
        new GetQaAutomationScheduleUseCase(repo),
      inject: [QA_AUTOMATION_SCHEDULE_REPOSITORY],
    },
    {
      provide: UpdateQaAutomationScheduleUseCase,
      useFactory: (repo: QaAutomationScheduleRepository) =>
        new UpdateQaAutomationScheduleUseCase(repo),
      inject: [QA_AUTOMATION_SCHEDULE_REPOSITORY],
    },
    {
      provide: QA_AUTOMATION_STAGING_SCHEDULE_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaQaAutomationStagingScheduleRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: GetQaAutomationStagingScheduleUseCase,
      useFactory: (repo: QaAutomationStagingScheduleRepository) =>
        new GetQaAutomationStagingScheduleUseCase(repo),
      inject: [QA_AUTOMATION_STAGING_SCHEDULE_REPOSITORY],
    },
    {
      provide: UpdateQaAutomationStagingScheduleUseCase,
      useFactory: (repo: QaAutomationStagingScheduleRepository) =>
        new UpdateQaAutomationStagingScheduleUseCase(repo),
      inject: [QA_AUTOMATION_STAGING_SCHEDULE_REPOSITORY],
    },
    {
      // The real BullMQ producer Queue for the staging suite — apps/qa-automation
      // consumes the same queue name/job shape via @cqp/queue (see docs/adr/0036).
      provide: QA_AUTOMATION_STAGING_QUEUE,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        return createQaAutomationStagingBullQueue(createRedisConnection(redisUrl));
      },
    },
    {
      provide: ListQaAutomationRunsUseCase,
      useFactory: (repo: QaAutomationRunRepository) => new ListQaAutomationRunsUseCase(repo),
      inject: [QA_AUTOMATION_RUN_REPOSITORY],
    },
    {
      provide: GetQaAutomationRunUseCase,
      useFactory: (
        runRepo: QaAutomationRunRepository,
        resultRepo: QaAutomationTestResultRepository,
      ) => new GetQaAutomationRunUseCase(runRepo, resultRepo),
      inject: [QA_AUTOMATION_RUN_REPOSITORY, QA_AUTOMATION_TEST_RESULT_REPOSITORY],
    },
    {
      provide: QA_AUTOMATION_REPORT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaQaAutomationReportRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Dev/single-instance adapter — mirrors ReportModule/UnitTestModule exactly.
      provide: OBJECT_STORAGE,
      useFactory: () =>
        new LocalFilesystemObjectStorage(process.env.CQP_STORAGE_ROOT ?? './.data/storage'),
    },
    {
      provide: ListQaAutomationReportsByRunUseCase,
      useFactory: (repo: QaAutomationReportRepository) =>
        new ListQaAutomationReportsByRunUseCase(repo),
      inject: [QA_AUTOMATION_REPORT_REPOSITORY],
    },
    {
      provide: GetQaAutomationReportUseCase,
      useFactory: (repo: QaAutomationReportRepository) => new GetQaAutomationReportUseCase(repo),
      inject: [QA_AUTOMATION_REPORT_REPOSITORY],
    },
    {
      provide: GetQaAutomationReportContentUseCase,
      useFactory: (
        getQaAutomationReportUseCase: GetQaAutomationReportUseCase,
        storage: ObjectStorage,
      ) => new GetQaAutomationReportContentUseCase(getQaAutomationReportUseCase, storage),
      inject: [GetQaAutomationReportUseCase, OBJECT_STORAGE],
    },
    {
      provide: GenerateQaAutomationReportUseCase,
      useFactory: (
        runRepo: QaAutomationRunRepository,
        resultRepo: QaAutomationTestResultRepository,
        reportRepo: QaAutomationReportRepository,
        storage: ObjectStorage,
      ) =>
        new GenerateQaAutomationReportUseCase(
          new GetQaAutomationRunUseCase(runRepo, resultRepo),
          reportRepo,
          storage,
        ),
      inject: [
        QA_AUTOMATION_RUN_REPOSITORY,
        QA_AUTOMATION_TEST_RESULT_REPOSITORY,
        QA_AUTOMATION_REPORT_REPOSITORY,
        OBJECT_STORAGE,
      ],
    },
  ],
})
export class QaAutomationModule {}
