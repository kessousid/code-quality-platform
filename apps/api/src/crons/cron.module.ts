import { Module } from '@nestjs/common';
import type { CronExecutor, CronRunRepository } from '@cqp/core';
import { ListCronRunsUseCase, TriggerCronRunUseCase } from '@cqp/application';
import { PrismaCronRunRepository } from '@cqp/db';
import { HttpCronExecutor } from '@cqp/cron-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CRON_EXECUTOR, CRON_RUN_REPOSITORY } from '../tokens.js';
import { CronController } from './cron.controller.js';
import { CronRunController } from './cron-run.controller.js';

@Module({
  controllers: [CronController, CronRunController],
  providers: [
    {
      provide: CRON_RUN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaCronRunRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      // Real outbound HTTP call to the external COD platform (docs/adr/0033) — no connection/env wiring needed, unlike the Redis-backed queue registries elsewhere in this file.
      provide: CRON_EXECUTOR,
      useFactory: () => new HttpCronExecutor(),
    },
    {
      provide: TriggerCronRunUseCase,
      useFactory: (repo: CronRunRepository, executor: CronExecutor) =>
        new TriggerCronRunUseCase(repo, executor),
      inject: [CRON_RUN_REPOSITORY, CRON_EXECUTOR],
    },
    {
      provide: ListCronRunsUseCase,
      useFactory: (repo: CronRunRepository) => new ListCronRunsUseCase(repo),
      inject: [CRON_RUN_REPOSITORY],
    },
  ],
})
export class CronModule {}
