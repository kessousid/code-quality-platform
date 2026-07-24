import { Module } from '@nestjs/common';
import type {
  GeneratedTestFileRepository,
  ObjectStorage,
  RepoRepository,
  TestCaseResultRepository,
  UnitTestQueueRegistry,
  UnitTestReportRepository,
  UnitTestRunRepository,
} from '@cqp/core';
import {
  CancelUnitTestRunUseCase,
  CreateUnitTestRunUseCase,
  GenerateUnitTestReportUseCase,
  GetUnitTestReportContentUseCase,
  GetUnitTestReportUseCase,
  GetUnitTestRunUseCase,
  ListGeneratedTestFilesByRunUseCase,
  ListTestCaseResultsByRunUseCase,
  ListUnitTestReportsByRunUseCase,
  ListUnitTestRunsByRepoUseCase,
} from '@cqp/application';
import {
  PrismaGeneratedTestFileRepository,
  PrismaTestCaseResultRepository,
  PrismaUnitTestReportRepository,
  PrismaUnitTestRunRepository,
} from '@cqp/db';
import { BullMqUnitTestQueueRegistry, createRedisConnection } from '@cqp/queue';
import { LocalFilesystemObjectStorage } from '@cqp/storage';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepoModule } from '../repos/repo.module.js';
import {
  GENERATED_TEST_FILE_REPOSITORY,
  OBJECT_STORAGE,
  REPO_REPOSITORY,
  TEST_CASE_RESULT_REPOSITORY,
  UNIT_TEST_QUEUE_REGISTRY,
  UNIT_TEST_REPORT_REPOSITORY,
  UNIT_TEST_RUN_REPOSITORY,
} from '../tokens.js';
import { UnitTestController } from './unit-test.controller.js';
import { UnitTestReportController } from './unit-test-report.controller.js';

@Module({
  imports: [RepoModule],
  controllers: [UnitTestController, UnitTestReportController],
  providers: [
    {
      provide: UNIT_TEST_RUN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUnitTestRunRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: UNIT_TEST_REPORT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUnitTestReportRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Dev/single-instance adapter — see docs/adr/0019. Same storage root as ReportModule's own registration; each module owns its own copy of this shared, stateless provider rather than importing across modules for one token.
      provide: OBJECT_STORAGE,
      useFactory: () =>
        new LocalFilesystemObjectStorage(process.env.CQP_STORAGE_ROOT ?? './.data/storage'),
    },
    {
      provide: GENERATED_TEST_FILE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaGeneratedTestFileRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: TEST_CASE_RESULT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaTestCaseResultRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Real BullMQ producer, one real queue per workerId (see docs/adr/0021,
      // 0024, 0031) — same pattern as ScanModule's queue registry.
      provide: UNIT_TEST_QUEUE_REGISTRY,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const connection = createRedisConnection(redisUrl);
        return new BullMqUnitTestQueueRegistry(connection);
      },
    },
    {
      provide: CreateUnitTestRunUseCase,
      useFactory: (
        unitTestRunRepository: UnitTestRunRepository,
        repoRepository: RepoRepository,
        unitTestQueueRegistry: UnitTestQueueRegistry,
      ) =>
        new CreateUnitTestRunUseCase(unitTestRunRepository, repoRepository, unitTestQueueRegistry),
      inject: [UNIT_TEST_RUN_REPOSITORY, REPO_REPOSITORY, UNIT_TEST_QUEUE_REGISTRY],
    },
    {
      provide: GetUnitTestRunUseCase,
      useFactory: (repository: UnitTestRunRepository) => new GetUnitTestRunUseCase(repository),
      inject: [UNIT_TEST_RUN_REPOSITORY],
    },
    {
      provide: ListUnitTestRunsByRepoUseCase,
      useFactory: (repository: UnitTestRunRepository) =>
        new ListUnitTestRunsByRepoUseCase(repository),
      inject: [UNIT_TEST_RUN_REPOSITORY],
    },
    {
      provide: ListTestCaseResultsByRunUseCase,
      useFactory: (repository: TestCaseResultRepository) =>
        new ListTestCaseResultsByRunUseCase(repository),
      inject: [TEST_CASE_RESULT_REPOSITORY],
    },
    {
      provide: ListGeneratedTestFilesByRunUseCase,
      useFactory: (repository: GeneratedTestFileRepository) =>
        new ListGeneratedTestFilesByRunUseCase(repository),
      inject: [GENERATED_TEST_FILE_REPOSITORY],
    },
    {
      provide: CancelUnitTestRunUseCase,
      useFactory: (
        unitTestRunRepository: UnitTestRunRepository,
        repoRepository: RepoRepository,
        unitTestQueueRegistry: UnitTestQueueRegistry,
      ) =>
        new CancelUnitTestRunUseCase(unitTestRunRepository, repoRepository, unitTestQueueRegistry),
      inject: [UNIT_TEST_RUN_REPOSITORY, REPO_REPOSITORY, UNIT_TEST_QUEUE_REGISTRY],
    },
    {
      provide: ListUnitTestReportsByRunUseCase,
      useFactory: (repository: UnitTestReportRepository) =>
        new ListUnitTestReportsByRunUseCase(repository),
      inject: [UNIT_TEST_REPORT_REPOSITORY],
    },
    {
      provide: GetUnitTestReportUseCase,
      useFactory: (repository: UnitTestReportRepository) =>
        new GetUnitTestReportUseCase(repository),
      inject: [UNIT_TEST_REPORT_REPOSITORY],
    },
    {
      provide: GetUnitTestReportContentUseCase,
      useFactory: (getUnitTestReportUseCase: GetUnitTestReportUseCase, storage: ObjectStorage) =>
        new GetUnitTestReportContentUseCase(getUnitTestReportUseCase, storage),
      inject: [GetUnitTestReportUseCase, OBJECT_STORAGE],
    },
    {
      provide: GenerateUnitTestReportUseCase,
      useFactory: (
        unitTestRunRepository: UnitTestRunRepository,
        generatedTestFileRepository: GeneratedTestFileRepository,
        testCaseResultRepository: TestCaseResultRepository,
        unitTestReportRepository: UnitTestReportRepository,
        storage: ObjectStorage,
      ) =>
        new GenerateUnitTestReportUseCase(
          new GetUnitTestRunUseCase(unitTestRunRepository),
          generatedTestFileRepository,
          testCaseResultRepository,
          unitTestReportRepository,
          storage,
        ),
      inject: [
        UNIT_TEST_RUN_REPOSITORY,
        GENERATED_TEST_FILE_REPOSITORY,
        TEST_CASE_RESULT_REPOSITORY,
        UNIT_TEST_REPORT_REPOSITORY,
        OBJECT_STORAGE,
      ],
    },
  ],
  exports: [UNIT_TEST_RUN_REPOSITORY],
})
export class UnitTestModule {}
