import { PrismaClient } from '@prisma/client';

/**
 * Factory, not a top-level singleton — importing this module must never
 * open a database connection as a side effect (same rule as
 * apps/worker/src/queue.ts). Callers (apps/api, apps/worker) own the
 * instance's lifecycle; connection pooling/shutdown wiring is a Phase 5
 * concern.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export type { PrismaClient };
