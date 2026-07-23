import { Module } from '@nestjs/common';
import type { FindingRepository } from '@cqp/core';
import { GetFindingUseCase, ListFindingsUseCase } from '@cqp/application';
import { PrismaFindingRepository } from '@cqp/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { FINDING_REPOSITORY } from '../tokens.js';
import { FindingController } from './finding.controller.js';

@Module({
  controllers: [FindingController],
  providers: [
    {
      provide: FINDING_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaFindingRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: ListFindingsUseCase,
      useFactory: (repository: FindingRepository) => new ListFindingsUseCase(repository),
      inject: [FINDING_REPOSITORY],
    },
    {
      provide: GetFindingUseCase,
      useFactory: (repository: FindingRepository) => new GetFindingUseCase(repository),
      inject: [FINDING_REPOSITORY],
    },
  ],
  exports: [FINDING_REPOSITORY],
})
export class FindingModule {}
