import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  PrismaApiTokenRepository,
  PrismaAuthTokenRepository,
  PrismaOrgRepository,
  PrismaUserRepository,
} from '@cqp/db';
import { NodemailerEmailSender } from '@cqp/email';
import type { EmailSender } from '@cqp/core';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  API_TOKEN_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  EMAIL_SENDER,
  ORG_REPOSITORY,
  USER_REPOSITORY,
} from '../tokens.js';
import { ApiTokenGuard } from './api-token.guard.js';
import { AuthController } from './auth.controller.js';

/** Bootstrap-time, not per-request — a missing credential should fail loudly at startup, not silently on the first signup/reset email (docs/adr/0041). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

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
    {
      provide: AUTH_TOKEN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAuthTokenRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: EMAIL_SENDER,
      // Same Gmail identity already used by apps/qa-automation (docs/adr/0035)
      // — one outbound-email account for the whole platform, not a
      // separate one per feature.
      useFactory: (): EmailSender =>
        new NodemailerEmailSender({
          fromAddress: requireEnv('ALERT_EMAIL_FROM'),
          appPassword: requireEnv('ALERT_EMAIL_APP_PASSWORD'),
        }),
    },
    { provide: APP_GUARD, useClass: ApiTokenGuard },
  ],
  exports: [API_TOKEN_REPOSITORY, ORG_REPOSITORY, USER_REPOSITORY, AUTH_TOKEN_REPOSITORY],
})
export class AuthModule {}
