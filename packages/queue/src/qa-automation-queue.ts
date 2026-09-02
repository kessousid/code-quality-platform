import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { QaAutomationTrigger } from '@cqp/core';

export interface QaAutomationJobData {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
}

export const QA_AUTOMATION_QUEUE_NAME = 'qa-automation';

/** Fixed twice-daily (00:00 and 12:00 IST) schedule (docs/adr/0042) — not user-configurable. */
const PRODUCTION_CRON_PATTERN = '0 0,12 * * *';
const PRODUCTION_CRON_TZ = 'Asia/Kolkata';

/**
 * One fixed scheduler id per org — `upsertQaAutomationSchedule` removes
 * and replaces whatever repeatable job already exists under this key, so
 * enabling/disabling never leaves a stale duplicate ticking alongside the
 * new one (see docs/adr/0035).
 */
export function qaAutomationSchedulerId(orgId: string): string {
  return `qa-automation-${orgId}`;
}

export function createQaAutomationBullQueue(
  connection: ConnectionOptions,
): Queue<QaAutomationJobData> {
  return new Queue<QaAutomationJobData>(QA_AUTOMATION_QUEUE_NAME, { connection });
}

export function createQaAutomationBullWorker(
  connection: ConnectionOptions,
  processor: Processor<QaAutomationJobData>,
): Worker<QaAutomationJobData> {
  return new Worker<QaAutomationJobData>(QA_AUTOMATION_QUEUE_NAME, processor, { connection });
}

/** Called from `apps/api` whenever `PUT /qa-automation/schedule` enables the production run — no redeploy needed. */
export async function upsertQaAutomationSchedule(
  queue: Queue<QaAutomationJobData>,
  orgId: string,
): Promise<void> {
  await queue.upsertJobScheduler(
    qaAutomationSchedulerId(orgId),
    { pattern: PRODUCTION_CRON_PATTERN, tz: PRODUCTION_CRON_TZ },
    { data: { orgId, triggeredBy: 'scheduled' } },
  );
}

export async function removeQaAutomationSchedule(
  queue: Queue<QaAutomationJobData>,
  orgId: string,
): Promise<void> {
  await queue.removeJobScheduler(qaAutomationSchedulerId(orgId));
}

/** Producer-side enqueue for a manual "Run now" trigger — a one-off job, not a repeatable scheduler. */
export async function enqueueManualQaAutomationRun(
  queue: Queue<QaAutomationJobData>,
  orgId: string,
): Promise<void> {
  await queue.add('run-qa-automation-suite', { orgId, triggeredBy: 'manual' });
}

/**
 * Producer-side enqueue for a deploy-notification-email match (docs/adr/0058)
 * — a one-off job, same as the manual trigger, just a different
 * `triggeredBy` label so the dashboard/reports can tell the two apart.
 * Called from apps/qa-automation's own poll worker, not from any use case
 * (packages/application must not depend on this adapter package).
 */
export async function enqueueMailTriggeredQaAutomationRun(
  queue: Queue<QaAutomationJobData>,
  orgId: string,
): Promise<void> {
  await queue.add('run-qa-automation-suite', { orgId, triggeredBy: 'mail_triggered' });
}
