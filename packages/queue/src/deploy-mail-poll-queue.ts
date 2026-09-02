import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';

export interface DeployMailPollJobData {
  orgId: string;
}

export const DEPLOY_MAIL_POLL_QUEUE_NAME = 'deploy-mail-poll';

/** Fixed hourly cadence (docs/adr/0058) — not user-configurable, no dashboard toggle in this first pass. */
const DEPLOY_MAIL_POLL_CRON_PATTERN = '0 * * * *';
const DEPLOY_MAIL_POLL_CRON_TZ = 'Asia/Kolkata';

/** One fixed scheduler id per org, same shape as qaAutomationSchedulerId — keeps upserts idempotent across restarts. */
export function deployMailPollSchedulerId(orgId: string): string {
  return `deploy-mail-poll-${orgId}`;
}

export function createDeployMailPollBullQueue(
  connection: ConnectionOptions,
): Queue<DeployMailPollJobData> {
  return new Queue<DeployMailPollJobData>(DEPLOY_MAIL_POLL_QUEUE_NAME, { connection });
}

export function createDeployMailPollBullWorker(
  connection: ConnectionOptions,
  processor: Processor<DeployMailPollJobData>,
): Worker<DeployMailPollJobData> {
  return new Worker<DeployMailPollJobData>(DEPLOY_MAIL_POLL_QUEUE_NAME, processor, { connection });
}

/** Called once at apps/qa-automation startup, only when all DEPLOY_MAIL_* env vars are present. */
export async function upsertDeployMailPollSchedule(
  queue: Queue<DeployMailPollJobData>,
  orgId: string,
): Promise<void> {
  await queue.upsertJobScheduler(
    deployMailPollSchedulerId(orgId),
    { pattern: DEPLOY_MAIL_POLL_CRON_PATTERN, tz: DEPLOY_MAIL_POLL_CRON_TZ },
    { data: { orgId } },
  );
}
