import { chromium, type Browser } from 'playwright';
import type { Job } from 'bullmq';
import {
  createPrismaClient,
  PrismaQaAutomationRunRepository,
  PrismaQaAutomationScheduleRepository,
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
  const emailSender = new NodemailerEmailSender({
    fromAddress: requireEnv('ALERT_EMAIL_FROM'),
    appPassword: requireEnv('ALERT_EMAIL_APP_PASSWORD'),
  });
  const alertEmailTo = requireEnv('ALERT_EMAIL_TO');
  const alertEmailCc = process.env.ALERT_EMAIL_CC;

  const useCase = new RunQaAutomationSuiteUseCase(
    new PrismaQaAutomationRunRepository(prisma),
    new PrismaQaAutomationTestResultRepository(prisma),
    new PrismaQaAutomationScheduleRepository(prisma),
    createPortalAutomationTests(credentials, slotCheckCredentials),
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
      stagingUseCase.execute({ orgId: job.data.orgId, triggeredBy: job.data.triggeredBy }),
  );

  stagingWorker.on('completed', (job) => {
    console.log(
      `[qa-automation-staging] job ${job.id} (org ${job.data.orgId}, ${job.data.triggeredBy}) completed`,
    );
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

main().catch((error: unknown) => {
  console.error('[qa-automation] fatal error during bootstrap:', error);
  process.exitCode = 1;
});
