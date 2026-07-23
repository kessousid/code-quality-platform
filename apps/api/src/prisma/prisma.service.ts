import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@cqp/db';

/**
 * Prisma is lazy by default (it connects on first query, not on
 * construction), so this deliberately does NOT $connect() in an
 * OnModuleInit hook — booting the API must not require a live database
 * just to serve /health. Only requests that actually touch a repository
 * (e.g. POST /scans) will attempt a connection.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
