import { Module } from '@nestjs/common';
import type { RepoRepository } from '@cqp/core';
import {
  CreateRepoUseCase,
  GetRepoUseCase,
  ListReposUseCase,
  parseRepoTokenEncryptionKey,
  UpdateRepoAccessTokenUseCase,
} from '@cqp/application';
import { PrismaRepoRepository } from '@cqp/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { REPO_REPOSITORY } from '../tokens.js';
import { RepoController } from './repo.controller.js';

/** Bootstrap-time, not per-request — a missing/malformed key should fail loudly at startup, not silently on the first repo creation (docs/adr/0047). */
function getRepoTokenEncryptionKey(): Buffer {
  const value = process.env.REPO_TOKEN_ENCRYPTION_KEY;
  if (!value) {
    throw new Error('Missing required env var: REPO_TOKEN_ENCRYPTION_KEY');
  }
  return parseRepoTokenEncryptionKey(value);
}

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
      useFactory: (repository: RepoRepository) =>
        new CreateRepoUseCase(repository, getRepoTokenEncryptionKey()),
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
    {
      provide: UpdateRepoAccessTokenUseCase,
      useFactory: (repository: RepoRepository) =>
        new UpdateRepoAccessTokenUseCase(repository, getRepoTokenEncryptionKey()),
      inject: [REPO_REPOSITORY],
    },
  ],
  exports: [REPO_REPOSITORY],
})
export class RepoModule {}
