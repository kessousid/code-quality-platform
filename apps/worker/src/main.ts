import { createPrismaClient } from '@cqp/db';
import { createRedisConnection } from '@cqp/queue';
import { createCoverageWorker, createScanWorker, createUnitTestWorker } from './queue.js';

/**
 * Real bootstrap (see docs/adr/0021, docs/adr/0024, docs/adr/0025) — one
 * process, one Redis connection, one Prisma client, three independent
 * BullMQ workers (scans, unit-test generation, coverage gate) so a slow
 * LLM-backed run never blocks scan/coverage throughput or vice versa.
 */
async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = createRedisConnection(redisUrl);
  const prisma = createPrismaClient();

  const scanWorker = createScanWorker(connection, prisma);
  scanWorker.on('completed', (job) => {
    console.log(`[worker] scan job ${job.id} (scan ${job.data.scanId}) completed`);
  });
  scanWorker.on('failed', (job, error) => {
    console.error(`[worker] scan job ${job?.id} (scan ${job?.data.scanId}) failed:`, error);
  });

  const unitTestWorker = createUnitTestWorker(connection, prisma);
  unitTestWorker.on('completed', (job) => {
    console.log(`[worker] unit-test job ${job.id} (run ${job.data.runId}) completed`);
  });
  unitTestWorker.on('failed', (job, error) => {
    console.error(`[worker] unit-test job ${job?.id} (run ${job?.data.runId}) failed:`, error);
  });

  const coverageWorker = createCoverageWorker(connection, prisma);
  coverageWorker.on('completed', (job) => {
    console.log(`[worker] coverage job ${job.id} (run ${job.data.runId}) completed`);
  });
  coverageWorker.on('failed', (job, error) => {
    console.error(`[worker] coverage job ${job?.id} (run ${job?.data.runId}) failed:`, error);
  });

  console.log(
    `[worker] listening on queues "scans", "unit-tests", and "coverage-runs" via ${redisUrl}`,
  );

  const shutdown = async (): Promise<void> => {
    console.log('[worker] shutting down...');
    await scanWorker.close();
    await unitTestWorker.close();
    await coverageWorker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  console.error('[worker] fatal error during bootstrap:', error);
  process.exitCode = 1;
});
