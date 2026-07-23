import { Module } from '@nestjs/common';
import type {
  CoverageFileResultRepository,
  CoverageQueue,
  CoverageReportRepository,
  CoverageRunRepository,
  ObjectStorage,
  RepoRepository,
} from '@cqp/core';
import {
  CancelCoverageRunUseCase,
  CreateCoverageRunUseCase,
  GenerateCoverageReportUseCase,
  GetCoverageReportContentUseCase,
  GetCoverageReportUseCase,
  GetCoverageRunUseCase,
  ListCoverageFileResultsByRunUseCase,
  ListCoverageReportsByRunUseCase,
  ListCoverageRunsByRepoUseCase,
} from '@cqp/application';
import {
  PrismaCoverageFileResultRepository,
  PrismaCoverageReportRepository,
  PrismaCoverageRunRepository,
} from '@cqp/db';
import { BullMqCoverageQueue, createCoverageBullQueue, createRedisConnection } from '@cqp/queue';
import { LocalFilesystemObjectStorage } from '@cqp/storage';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepoModule } from '../repos/repo.module.js';
import {
  COVERAGE_FILE_RESULT_REPOSITORY,
  COVERAGE_QUEUE,
  COVERAGE_REPORT_REPOSITORY,
  COVERAGE_RUN_REPOSITORY,
  OBJECT_STORAGE,
  REPO_REPOSITORY,
} from '../tokens.js';
import { CoverageController } from './coverage.controller.js';
import { CoverageReportController } from './coverage-report.controller.js';

/** Mirrors UnitTestModule's shape (docs/adr/0021, 0023, 0024) exactly — see docs/adr/0025 for what's new: zero-LLM, its own queue/connection. */
@Module({
  imports: [RepoModule],
  controllers: [CoverageController, CoverageReportController],
  providers: [
    {
      provide: COVERAGE_RUN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCoverageRunRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: COVERAGE_FILE_RESULT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCoverageFileResultRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: COVERAGE_REPORT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCoverageReportRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Dev/single-instance adapter — see docs/adr/0019. Same storage root as ReportModule's own registration; each module owns its own copy of this shared, stateless provider rather than importing across modules for one token.
      provide: OBJECT_STORAGE,
      useFactory: () =>
        new LocalFilesystemObjectStorage(process.env.CQP_STORAGE_ROOT ?? './.data/storage'),
    },
    {
      // Real BullMQ producer (see docs/adr/0021, 0024, 0025) — same pattern as UnitTestModule's queue, a separate queue name/connection.
      provide: COVERAGE_QUEUE,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const connection = createRedisConnection(redisUrl);
        return new BullMqCoverageQueue(createCoverageBullQueue(connection));
      },
    },
    {
      provide: CreateCoverageRunUseCase,
      useFactory: (
        coverageRunRepository: CoverageRunRepository,
        repoRepository: RepoRepository,
        coverageQueue: CoverageQueue,
      ) => new CreateCoverageRunUseCase(coverageRunRepository, repoRepository, coverageQueue),
      inject: [COVERAGE_RUN_REPOSITORY, REPO_REPOSITORY, COVERAGE_QUEUE],
    },
    {
      provide: GetCoverageRunUseCase,
      useFactory: (repository: CoverageRunRepository) => new GetCoverageRunUseCase(repository),
      inject: [COVERAGE_RUN_REPOSITORY],
    },
    {
      provide: ListCoverageRunsByRepoUseCase,
      useFactory: (repository: CoverageRunRepository) =>
        new ListCoverageRunsByRepoUseCase(repository),
      inject: [COVERAGE_RUN_REPOSITORY],
    },
    {
      provide: ListCoverageFileResultsByRunUseCase,
      useFactory: (repository: CoverageFileResultRepository) =>
        new ListCoverageFileResultsByRunUseCase(repository),
      inject: [COVERAGE_FILE_RESULT_REPOSITORY],
    },
    {
      provide: CancelCoverageRunUseCase,
      useFactory: (coverageRunRepository: CoverageRunRepository, coverageQueue: CoverageQueue) =>
        new CancelCoverageRunUseCase(coverageRunRepository, coverageQueue),
      inject: [COVERAGE_RUN_REPOSITORY, COVERAGE_QUEUE],
    },
    {
      provide: ListCoverageReportsByRunUseCase,
      useFactory: (repository: CoverageReportRepository) =>
        new ListCoverageReportsByRunUseCase(repository),
      inject: [COVERAGE_REPORT_REPOSITORY],
    },
    {
      provide: GetCoverageReportUseCase,
      useFactory: (repository: CoverageReportRepository) =>
        new GetCoverageReportUseCase(repository),
      inject: [COVERAGE_REPORT_REPOSITORY],
    },
    {
      provide: GetCoverageReportContentUseCase,
      useFactory: (getCoverageReportUseCase: GetCoverageReportUseCase, storage: ObjectStorage) =>
        new GetCoverageReportContentUseCase(getCoverageReportUseCase, storage),
      inject: [GetCoverageReportUseCase, OBJECT_STORAGE],
    },
    {
      provide: GenerateCoverageReportUseCase,
      useFactory: (
        coverageRunRepository: CoverageRunRepository,
        coverageFileResultRepository: CoverageFileResultRepository,
        coverageReportRepository: CoverageReportRepository,
        storage: ObjectStorage,
      ) =>
        new GenerateCoverageReportUseCase(
          new GetCoverageRunUseCase(coverageRunRepository),
          coverageFileResultRepository,
          coverageReportRepository,
          storage,
        ),
      inject: [
        COVERAGE_RUN_REPOSITORY,
        COVERAGE_FILE_RESULT_REPOSITORY,
        COVERAGE_REPORT_REPOSITORY,
        OBJECT_STORAGE,
      ],
    },
  ],
  exports: [COVERAGE_RUN_REPOSITORY],
})
export class CoverageModule {}
