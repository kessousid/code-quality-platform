import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaApiTokenRepository, PrismaOrgRepository, PrismaUserRepository } from '@cqp/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_TOKEN_REPOSITORY, ORG_REPOSITORY, USER_REPOSITORY } from '../tokens.js';
import { ApiTokenGuard } from './api-token.guard.js';
import { AuthController } from './auth.controller.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: API_TOKEN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaApiTokenRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: ORG_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOrgRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: USER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma.client),
      inject: [PrismaService],
    },
    { provide: APP_GUARD, useClass: ApiTokenGuard },
  ],
  exports: [API_TOKEN_REPOSITORY, ORG_REPOSITORY, USER_REPOSITORY],
})
export class AuthModule {}
