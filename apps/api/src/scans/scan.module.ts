import { Module } from '@nestjs/common';
import type {
  FindingRepository,
  RepoRepository,
  ScanQueueRegistry,
  ScanRepository,
} from '@cqp/core';
import {
  CancelScanUseCase,
  CreateScanUseCase,
  GetScanSummaryUseCase,
  GetScanUseCase,
  ListFindingsByScanUseCase,
  ListScansByRepoUseCase,
} from '@cqp/application';
import { PrismaScanRepository } from '@cqp/db';
import { BullMqScanQueueRegistry, createRedisConnection } from '@cqp/queue';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepoModule } from '../repos/repo.module.js';
import { FindingModule } from '../findings/finding.module.js';
import {
  FINDING_REPOSITORY,
  REPO_REPOSITORY,
  SCAN_QUEUE_REGISTRY,
  SCAN_REPOSITORY,
} from '../tokens.js';
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
      // Real BullMQ producer, one real queue per workerId (see docs/adr/0021,
      // docs/adr/0031) — `apps/worker` consumes the same queue names/job
      // shape via `@cqp/queue`. Connection is opened here, not at
      // module-import time, matching every other adapter's "no side effect
      // on import" rule.
      provide: SCAN_QUEUE_REGISTRY,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const connection = createRedisConnection(redisUrl);
        return new BullMqScanQueueRegistry(connection);
      },
    },
    {
      provide: CreateScanUseCase,
      useFactory: (
        scanRepository: ScanRepository,
        repoRepository: RepoRepository,
        scanQueueRegistry: ScanQueueRegistry,
      ) => new CreateScanUseCase(scanRepository, repoRepository, scanQueueRegistry),
      inject: [SCAN_REPOSITORY, REPO_REPOSITORY, SCAN_QUEUE_REGISTRY],
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
      useFactory: (
        scanRepository: ScanRepository,
        repoRepository: RepoRepository,
        scanQueueRegistry: ScanQueueRegistry,
      ) => new CancelScanUseCase(scanRepository, repoRepository, scanQueueRegistry),
      inject: [SCAN_REPOSITORY, REPO_REPOSITORY, SCAN_QUEUE_REGISTRY],
    },
  ],
  exports: [SCAN_REPOSITORY],
})
export class ScanModule {}
