import { createPrismaClient } from '@cqp/db';
import {
  browseQueueName,
  coverageQueueName,
  createRedisConnection,
  scanQueueName,
  unitTestQueueName,
} from '@cqp/queue';
import {
  createCoverageWorker,
  createDirectoryBrowseWorker,
  createScanWorker,
  createUnitTestWorker,
} from './queue.js';

/** Never logs the full connection string — it embeds a password, unlike everything else this worker prints. */
function redisHost(redisUrl: string): string {
  try {
    return new URL(redisUrl).host;
  } catch {
    return '(unparseable URL)';
  }
}

/**
 * Real bootstrap (see docs/adr/0021, docs/adr/0024, docs/adr/0025,
 * docs/adr/0031, docs/adr/0032) — one process, one Redis connection, one
 * Prisma client, four independent BullMQ workers (scans, unit-test
 * generation, coverage gate, directory browsing) so a slow LLM-backed run
 * never blocks scan/coverage throughput or vice versa. `WORKER_ID`
 * (default `'default'`) scopes which repos' jobs this instance actually
 * consumes — a repo whose `localPath` lives on a different machine is
 * invisible to this worker, by design.
 */
async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const workerId = process.env.WORKER_ID ?? 'default';
  const connection = createRedisConnection(redisUrl);
  const prisma = createPrismaClient();

  const scanWorker = createScanWorker(connection, prisma, workerId);
  scanWorker.on('completed', (job) => {
    console.log(`[worker] scan job ${job.id} (scan ${job.data.scanId}) completed`);
  });
  scanWorker.on('failed', (job, error) => {
    console.error(`[worker] scan job ${job?.id} (scan ${job?.data.scanId}) failed:`, error);
  });

  const unitTestWorker = createUnitTestWorker(connection, prisma, workerId);
  unitTestWorker.on('completed', (job) => {
    console.log(`[worker] unit-test job ${job.id} (run ${job.data.runId}) completed`);
  });
  unitTestWorker.on('failed', (job, error) => {
    console.error(`[worker] unit-test job ${job?.id} (run ${job?.data.runId}) failed:`, error);
  });

  const coverageWorker = createCoverageWorker(connection, prisma, workerId);
  coverageWorker.on('completed', (job) => {
    console.log(`[worker] coverage job ${job.id} (run ${job.data.runId}) completed`);
  });
  coverageWorker.on('failed', (job, error) => {
    console.error(`[worker] coverage job ${job?.id} (run ${job?.data.runId}) failed:`, error);
  });

  const browseWorker = createDirectoryBrowseWorker(connection, workerId);
  browseWorker.on('completed', (job) => {
    console.log(`[worker] browse job ${job.id} (path ${job.data.path ?? '(home)'}) completed`);
  });
  browseWorker.on('failed', (job, error) => {
    console.error(
      `[worker] browse job ${job?.id} (path ${job?.data.path ?? '(home)'}) failed:`,
      error,
    );
  });

  console.log(
    `[worker] workerId "${workerId}" listening on queues "${scanQueueName(workerId)}", "${unitTestQueueName(workerId)}", "${coverageQueueName(workerId)}", and "${browseQueueName(workerId)}" via ${redisHost(redisUrl)}`,
  );

  const shutdown = async (): Promise<void> => {
    console.log('[worker] shutting down...');
    await scanWorker.close();
    await unitTestWorker.close();
    await coverageWorker.close();
    await browseWorker.close();
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
