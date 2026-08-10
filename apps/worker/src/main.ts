import { createPrismaClient } from '@cqp/db';
import {
  browseQueueName,
  coverageQueueName,
  createRedisConnection,
  scanQueueName,
  unitTestQueueName,
} from '@cqp/queue';
import { parseRepoTokenEncryptionKey } from '@cqp/application';
import { GitCloneCheckoutProvider } from '@cqp/git-checkout';
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

/** Bootstrap-time, not per-job — a missing/malformed key should fail loudly at startup, not silently on the first github/gitlab repo's run (docs/adr/0047). */
function getRepoTokenEncryptionKey(): Buffer {
  const value = process.env.REPO_TOKEN_ENCRYPTION_KEY;
  if (!value) {
    throw new Error('Missing required env var: REPO_TOKEN_ENCRYPTION_KEY');
  }
  return parseRepoTokenEncryptionKey(value);
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
  // Only ever exercised by a github/gitlab repo (docs/adr/0047) — a 'local'
  // repo (the common case for a user's own laptop worker) never touches
  // either of these, so a worker that only ever sees local repos doesn't
  // strictly need REPO_TOKEN_ENCRYPTION_KEY set... but every worker
  // (including a laptop one) still requires it, matching ALERT_EMAIL_*'s
  // fail-loudly-at-boot precedent rather than deferring to first use.
  const checkoutProvider = new GitCloneCheckoutProvider();
  const repoTokenDecryptionKey = getRepoTokenEncryptionKey();

  const scanWorker = createScanWorker(
    connection,
    prisma,
    workerId,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
  scanWorker.on('completed', (job) => {
    console.log(`[worker] scan job ${job.id} (scan ${job.data.scanId}) completed`);
  });
  scanWorker.on('failed', (job, error) => {
    console.error(`[worker] scan job ${job?.id} (scan ${job?.data.scanId}) failed:`, error);
  });

  const unitTestWorker = createUnitTestWorker(
    connection,
    prisma,
    workerId,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
  unitTestWorker.on('completed', (job) => {
    console.log(`[worker] unit-test job ${job.id} (run ${job.data.runId}) completed`);
  });
  unitTestWorker.on('failed', (job, error) => {
    console.error(`[worker] unit-test job ${job?.id} (run ${job?.data.runId}) failed:`, error);
  });

  const coverageWorker = createCoverageWorker(
    connection,
    prisma,
    workerId,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
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
