import { Module } from '@nestjs/common';
import type {
  FindingRepository,
  ObjectStorage,
  RepoRepository,
  ReportRepository,
  ScanRepository,
} from '@cqp/core';
import {
  GenerateReportUseCase,
  GetReportContentUseCase,
  GetReportUseCase,
  GetRepoUseCase,
  GetScanUseCase,
  ListReportsByScanUseCase,
} from '@cqp/application';
import { PrismaReportRepository } from '@cqp/db';
import { LocalFilesystemObjectStorage } from '@cqp/storage';
import { PrismaService } from '../prisma/prisma.service.js';
import { RepoModule } from '../repos/repo.module.js';
import { ScanModule } from '../scans/scan.module.js';
import { FindingModule } from '../findings/finding.module.js';
import {
  FINDING_REPOSITORY,
  OBJECT_STORAGE,
  REPO_REPOSITORY,
  REPORT_REPOSITORY,
  SCAN_REPOSITORY,
} from '../tokens.js';
import { ReportController } from './report.controller.js';

@Module({
  imports: [RepoModule, ScanModule, FindingModule],
  controllers: [ReportController],
  providers: [
    {
      provide: REPORT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaReportRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Dev/single-instance adapter — see docs/adr/0019. Root is
      // configurable so it never defaults into source control.
      provide: OBJECT_STORAGE,
      useFactory: () =>
        new LocalFilesystemObjectStorage(process.env.CQP_STORAGE_ROOT ?? './.data/storage'),
    },
    {
      provide: ListReportsByScanUseCase,
      useFactory: (repository: ReportRepository) => new ListReportsByScanUseCase(repository),
      inject: [REPORT_REPOSITORY],
    },
    {
      provide: GetReportUseCase,
      useFactory: (repository: ReportRepository) => new GetReportUseCase(repository),
      inject: [REPORT_REPOSITORY],
    },
    {
      provide: GetReportContentUseCase,
      useFactory: (getReportUseCase: GetReportUseCase, storage: ObjectStorage) =>
        new GetReportContentUseCase(getReportUseCase, storage),
      inject: [GetReportUseCase, OBJECT_STORAGE],
    },
    {
      provide: GenerateReportUseCase,
      useFactory: (
        scanRepository: ScanRepository,
        repoRepository: RepoRepository,
        findingRepository: FindingRepository,
        reportRepository: ReportRepository,
        storage: ObjectStorage,
      ) =>
        new GenerateReportUseCase(
          new GetScanUseCase(scanRepository),
          new GetRepoUseCase(repoRepository),
          findingRepository,
          reportRepository,
          storage,
        ),
      inject: [
        SCAN_REPOSITORY,
        REPO_REPOSITORY,
        FINDING_REPOSITORY,
        REPORT_REPOSITORY,
        OBJECT_STORAGE,
      ],
    },
  ],
})
export class ReportModule {}
