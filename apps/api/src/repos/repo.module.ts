import { Module } from '@nestjs/common';
import type { RepoRepository } from '@cqp/core';
import { CreateRepoUseCase, GetRepoUseCase, ListReposUseCase } from '@cqp/application';
import { PrismaRepoRepository } from '@cqp/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { REPO_REPOSITORY } from '../tokens.js';
import { RepoController } from './repo.controller.js';

@Module({
  controllers: [RepoController],
  providers: [
    {
      provide: REPO_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaRepoRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: CreateRepoUseCase,
      useFactory: (repository: RepoRepository) => new CreateRepoUseCase(repository),
      inject: [REPO_REPOSITORY],
    },
    {
      provide: GetRepoUseCase,
      useFactory: (repository: RepoRepository) => new GetRepoUseCase(repository),
      inject: [REPO_REPOSITORY],
    },
    {
      provide: ListReposUseCase,
      useFactory: (repository: RepoRepository) => new ListReposUseCase(repository),
      inject: [REPO_REPOSITORY],
    },
  ],
  exports: [REPO_REPOSITORY],
})
export class RepoModule {}
