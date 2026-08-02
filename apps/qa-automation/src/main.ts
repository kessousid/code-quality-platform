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
  type QaAutomationJobData,
} from '@cqp/queue';
import { RunQaAutomationSuiteUseCase, type QaBrowser } from '@cqp/application';
import { createPortalAutomationTests } from '@cqp/qa-automation-tests';
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
 * Real bootstrap for the production QA automation service (docs/adr/0035).
 * One BullMQ Worker consumes both the repeatable scheduled job (upserted
 * by apps/api whenever the interval changes) and manual "Run now" jobs —
 * this process is a pure consumer, oblivious to which kind produced a
 * given job. One real Chromium instance is launched per job, closed in
 * RunQaAutomationSuiteUseCase's own `finally` regardless of outcome.
 */
async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = createRedisConnection(redisUrl);
  const prisma = createPrismaClient();

  const credentials = {
    email: requireEnv('PORTAL_QA_EMAIL'),
    password: requireEnv('PORTAL_QA_PASSWORD'),
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
    createPortalAutomationTests(credentials),
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

  console.log(`[qa-automation] listening on queue "qa-automation" via ${redisHost(redisUrl)}`);

  const shutdown = async (): Promise<void> => {
    console.log('[qa-automation] shutting down...');
    await worker.close();
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
