import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { QaAutomationTrigger } from '@cqp/core';

export interface QaAutomationJobData {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
}

export const QA_AUTOMATION_QUEUE_NAME = 'qa-automation';

/**
 * One fixed scheduler id per org — `upsertQaAutomationSchedule` removes
 * and replaces whatever repeatable job already exists under this key, so
 * changing the interval never leaves a stale duplicate ticking alongside
 * the new one (see docs/adr/0035).
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

/** Called from `apps/api` whenever `PUT /qa-automation/schedule` changes the interval — no redeploy needed. */
export async function upsertQaAutomationSchedule(
  queue: Queue<QaAutomationJobData>,
  orgId: string,
  intervalHours: number,
): Promise<void> {
  await queue.upsertJobScheduler(
    qaAutomationSchedulerId(orgId),
    { every: intervalHours * 60 * 60 * 1000 },
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
