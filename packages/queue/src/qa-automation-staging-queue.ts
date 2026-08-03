import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { QaAutomationTrigger } from '@cqp/core';

export interface QaAutomationStagingJobData {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
}

export const QA_AUTOMATION_STAGING_QUEUE_NAME = 'qa-automation-staging';

/** Fixed once-daily-at-midnight-IST schedule (docs/adr/0036) — not user-configurable like production's interval. */
const STAGING_CRON_PATTERN = '0 0 * * *';
const STAGING_CRON_TZ = 'Asia/Kolkata';

export function qaAutomationStagingSchedulerId(orgId: string): string {
  return `qa-automation-staging-${orgId}`;
}

export function createQaAutomationStagingBullQueue(
  connection: ConnectionOptions,
): Queue<QaAutomationStagingJobData> {
  return new Queue<QaAutomationStagingJobData>(QA_AUTOMATION_STAGING_QUEUE_NAME, { connection });
}

/**
 * The real pytest/playwright-python suite can plausibly run for
 * 30-90+ minutes (100+ real browser tests across 8 personas) — a generous
 * lock duration and no stalled-job timeout keep a long-but-healthy run
 * from ever being mistaken for a stuck one (docs/adr/0036).
 */
export function createQaAutomationStagingBullWorker(
  connection: ConnectionOptions,
  processor: Processor<QaAutomationStagingJobData>,
): Worker<QaAutomationStagingJobData> {
  return new Worker<QaAutomationStagingJobData>(QA_AUTOMATION_STAGING_QUEUE_NAME, processor, {
    connection,
    lockDuration: 2 * 60 * 60 * 1000,
    stalledInterval: 2 * 60 * 60 * 1000,
    maxStalledCount: 0,
  });
}

/** Called whenever `PUT /qa-automation/staging/schedule` enables the staging run — no redeploy needed. */
export async function upsertQaAutomationStagingSchedule(
  queue: Queue<QaAutomationStagingJobData>,
  orgId: string,
): Promise<void> {
  await queue.upsertJobScheduler(
    qaAutomationStagingSchedulerId(orgId),
    { pattern: STAGING_CRON_PATTERN, tz: STAGING_CRON_TZ },
    { data: { orgId, triggeredBy: 'scheduled' } },
  );
}

export async function removeQaAutomationStagingSchedule(
  queue: Queue<QaAutomationStagingJobData>,
  orgId: string,
): Promise<void> {
  await queue.removeJobScheduler(qaAutomationStagingSchedulerId(orgId));
}

/** Producer-side enqueue for a manual "Run now" trigger — a one-off job, not the repeatable scheduler. */
export async function enqueueManualQaAutomationStagingRun(
  queue: Queue<QaAutomationStagingJobData>,
  orgId: string,
): Promise<void> {
  await queue.add('run-qa-automation-staging-suite', { orgId, triggeredBy: 'manual' });
}
