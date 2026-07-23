import { Module } from '@nestjs/common';
import type { FindingRepository, RepoRepository, ScanQueue, ScanRepository } from '@cqp/core';
import {
  CancelScanUseCase,
  CreateScanUseCase,
  GetScanSummaryUseCase,
  GetScanUseCase,
  ListFindingsByScanUseCase,
  ListScansByRepoUseCase,
} from '@cqp/application';
import { PrismaScanRepository } from '@cqp/db';
import { BullMqScanQueue, createRedisConnection, createScanBullQueue } from '@cqp/queue';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepoModule } from '../repos/repo.module.js';
import { FindingModule } from '../findings/finding.module.js';
import { FINDING_REPOSITORY, REPO_REPOSITORY, SCAN_QUEUE, SCAN_REPOSITORY } from '../tokens.js';
import { ScanController } from './scan.controller.js';

@Module({
  imports: [RepoModule, FindingModule],
  controllers: [ScanController],
  providers: [
    {
      provide: SCAN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaScanRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Real BullMQ producer (see docs/adr/0021) — `apps/worker` consumes
      // the same queue name/job shape via `@cqp/queue`. Connection is
      // opened here, not at module-import time, matching every other
      // adapter's "no side effect on import" rule.
      provide: SCAN_QUEUE,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const connection = createRedisConnection(redisUrl);
        return new BullMqScanQueue(createScanBullQueue(connection));
      },
    },
    {
      provide: CreateScanUseCase,
      useFactory: (
        scanRepository: ScanRepository,
        repoRepository: RepoRepository,
        scanQueue: ScanQueue,
      ) => new CreateScanUseCase(scanRepository, repoRepository, scanQueue),
      inject: [SCAN_REPOSITORY, REPO_REPOSITORY, SCAN_QUEUE],
    },
    {
      provide: GetScanUseCase,
      useFactory: (repository: ScanRepository) => new GetScanUseCase(repository),
      inject: [SCAN_REPOSITORY],
    },
    {
      provide: ListScansByRepoUseCase,
      useFactory: (repository: ScanRepository) => new ListScansByRepoUseCase(repository),
      inject: [SCAN_REPOSITORY],
    },
    {
      provide: GetScanSummaryUseCase,
      useFactory: (scanRepository: ScanRepository, findingRepository: FindingRepository) =>
        new GetScanSummaryUseCase(new GetScanUseCase(scanRepository), findingRepository),
      inject: [SCAN_REPOSITORY, FINDING_REPOSITORY],
    },
    {
      provide: ListFindingsByScanUseCase,
      useFactory: (repository: FindingRepository) => new ListFindingsByScanUseCase(repository),
      inject: [FINDING_REPOSITORY],
    },
    {
      provide: CancelScanUseCase,
      useFactory: (scanRepository: ScanRepository, scanQueue: ScanQueue) =>
        new CancelScanUseCase(scanRepository, scanQueue),
      inject: [SCAN_REPOSITORY, SCAN_QUEUE],
    },
  ],
  exports: [SCAN_REPOSITORY],
})
export class ScanModule {}
