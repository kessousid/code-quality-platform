import { chromium, type Browser } from 'playwright';
import type { Job } from 'bullmq';
import {
  createPrismaClient,
  PrismaQaAutomationRunRepository,
  PrismaQaAutomationTestResultRepository,
} from '@cqp/db';
import {
  createRedisConnection,
  createQaAutomationBullWorker,
  createQaAutomationStagingBullWorker,
  type QaAutomationJobData,
  type QaAutomationStagingJobData,
} from '@cqp/queue';
import {
  ReconcileOrphanedQaAutomationRunsUseCase,
  RunQaAutomationSuiteUseCase,
  RunStagingTestSuiteUseCase,
  type QaBrowser,
} from '@cqp/application';
import { createPortalAutomationTests } from '@cqp/qa-automation-tests';
import { PytestStagingTestRunner } from '@cqp/staging-test-runner';
import { NodemailerEmailSender } from '@cqp/email';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Never logs the full connection string — it embeds a password. */
function redisHost(redisUrl: string): string {
  try {
    return new URL(redisUrl).host;
  } catch {
    return '(unparseable URL)';
  }
}

/**
 * Real bootstrap for the QA automation service (docs/adr/0035, docs/adr/0036).
 * Runs two independent BullMQ Workers in this one process/container: the
 * original production worker (one real Chromium instance launched per job,
 * closed in RunQaAutomationSuiteUseCase's own `finally`) and a second
 * staging worker that instead shells out to the external pytest suite via
 * PytestStagingTestRunner. Each worker consumes both its repeatable
 * scheduled job and manual "Run now" jobs, oblivious to which kind
 * produced a given job.
 */
async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = createRedisConnection(redisUrl);
  const prisma = createPrismaClient();

  const credentials = {
    email: requireEnv('PORTAL_QA_EMAIL'),
    password: requireEnv('PORTAL_QA_PASSWORD'),
  };
  // A dedicated login for the slot-related checks only (docs/adr/0035) —
  // every other check keeps using `credentials` above.
  const slotCheckCredentials = {
    email: requireEnv('PORTAL_QA_SLOT_CHECK_EMAIL'),
    password: requireEnv('PORTAL_QA_SLOT_CHECK_PASSWORD'),
  };
  // A dedicated Platform Admin login for the three Candidate Search
  // checks only — that feature lives on the recruiter/admin side of the
  // app, not the candidate/employer side `credentials` normally logs into.
  const candidateSearchCredentials = {
    email: requireEnv('PORTAL_QA_PLATFORM_ADMIN_EMAIL'),
    password: requireEnv('PORTAL_QA_PLATFORM_ADMIN_PASSWORD'),
  };
  const emailSender = new NodemailerEmailSender({
    fromAddress: requireEnv('ALERT_EMAIL_FROM'),
    appPassword: requireEnv('ALERT_EMAIL_APP_PASSWORD'),
  });
  const alertEmailTo = requireEnv('ALERT_EMAIL_TO');
  const alertEmailCc = process.env.ALERT_EMAIL_CC;

  // See docs/adr/0043 — a container restart mid-run (e.g. this very
  // deploy) kills the process before either use case's own try/catch can
  // mark its run failed, leaving it stuck at 'running' forever. Runs
  // before either worker starts accepting jobs.
  const orphaned = await new ReconcileOrphanedQaAutomationRunsUseCase(
    new PrismaQaAutomationRunRepository(prisma),
    emailSender,
    alertEmailTo,
    alertEmailCc,
  ).execute();
  if (orphaned.length > 0) {
    console.log(`[qa-automation] marked ${orphaned.length} orphaned run(s) failed on startup`);
  }

  const useCase = new RunQaAutomationSuiteUseCase(
    new PrismaQaAutomationRunRepository(prisma),
    new PrismaQaAutomationTestResultRepository(prisma),
    createPortalAutomationTests(credentials, slotCheckCredentials, candidateSearchCredentials),
    async (): Promise<QaBrowser> => {
      const browser: Browser = await chromium.launch({ headless: true });
      return {
        newPage: () => browser.newPage(),
        close: () => browser.close(),
      };
    },
    emailSender,
    alertEmailTo,
    alertEmailCc,
  );

  const worker = createQaAutomationBullWorker(connection, async (job: Job<QaAutomationJobData>) =>
    useCase.execute({ orgId: job.data.orgId, triggeredBy: job.data.triggeredBy }),
  );

  worker.on('completed', (job) => {
    console.log(
      `[qa-automation] job ${job.id} (org ${job.data.orgId}, ${job.data.triggeredBy}) completed`,
    );
  });
  worker.on('failed', (job, error) => {
    console.error(`[qa-automation] job ${job?.id} (org ${job?.data.orgId}) failed:`, error);
  });
  // EventEmitter throws synchronously if an 'error' event fires with no
  // listener attached -- without this, any internal BullMQ error on this
  // Worker (e.g. a Redis blip) crashes the whole process instead of just
  // logging.
  worker.on('error', (error) => {
    console.error('[qa-automation] worker error:', error);
  });

  const stagingUseCase = new RunStagingTestSuiteUseCase(
    new PrismaQaAutomationRunRepository(prisma),
    new PrismaQaAutomationTestResultRepository(prisma),
    new PytestStagingTestRunner({
      repoUrl: requireEnv('STAGING_TESTS_REPO_URL'),
      ...(process.env.STAGING_TESTS_GIT_TOKEN !== undefined
        ? { gitToken: process.env.STAGING_TESTS_GIT_TOKEN }
        : {}),
    }),
    emailSender,
    alertEmailTo,
    alertEmailCc,
  );

  const stagingWorker = createQaAutomationStagingBullWorker(
    connection,
    async (job: Job<QaAutomationStagingJobData>) =>
      stagingUseCase.execute({
        orgId: job.data.orgId,
        triggeredBy: job.data.triggeredBy,
        ...(job.data.onlyTestNames !== undefined ? { onlyTestNames: job.data.onlyTestNames } : {}),
      }),
  );

  stagingWorker.on('completed', (job) => {
    console.log(
      `[qa-automation-staging] job ${job.id} (org ${job.data.orgId}, ${job.data.triggeredBy}) completed`,
    );
  });
  stagingWorker.on('error', (error) => {
    console.error('[qa-automation-staging] worker error:', error);
  });
  stagingWorker.on('failed', (job, error) => {
    console.error(`[qa-automation-staging] job ${job?.id} (org ${job?.data.orgId}) failed:`, error);
  });

  console.log(
    `[qa-automation] listening on queues "qa-automation" and "qa-automation-staging" via ${redisHost(redisUrl)}`,
  );

  const shutdown = async (): Promise<void> => {
    console.log('[qa-automation] shutting down...');
    await worker.close();
    await stagingWorker.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Confirmed live (2026-08-20): a rejection from deep inside a job's own
 * processing (a plain `readdir` ENOENT, nothing exotic) still reached
 * Node's default crash handler and took down this entire long-running
 * process -- both the production and staging queues, not just the one
 * broken job -- even though the use case wrapping it has its own
 * try/catch. Whatever let it slip past that (most plausibly something in
 * BullMQ's own internals under I/O-heavy load, not this file), the fix
 * that actually matters for a worker service is not depending on every
 * layer's error handling being perfect: logging and staying up is far
 * better than a full-process crash that kills every other in-flight job
 * along with it. Registered before `main()` runs so nothing during
 * startup is unprotected either.
 */
process.on('uncaughtException', (error) => {
  console.error('[qa-automation] uncaught exception (process staying up):', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[qa-automation] unhandled rejection (process staying up):', reason);
});

main().catch((error: unknown) => {
  console.error('[qa-automation] fatal error during bootstrap:', error);
  process.exitCode = 1;
});
