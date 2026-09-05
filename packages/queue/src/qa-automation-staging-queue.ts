import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { QaAutomationTrigger } from '@cqp/core';

export interface QaAutomationStagingJobData {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
  /**
   * Set only for a "rerun failed/skipped tests" trigger — bare test
   * function names (parametrize suffix like `[chromium]` already
   * stripped) from a previous run's non-passing, non-quarantined
   * results. Deliberately not full pytest node IDs: the JUnit XML this
   * suite parses only gives pytest's dotted `classname` notation, which
   * can't be mechanically converted back into a real `file.py::Class`
   * path (dots collide with path separators, `.py`, and package
   * boundaries). The runner resolves these to real node IDs itself,
   * against its own fresh clone, the same way a human would (grep for
   * the def, walk up to the enclosing class) -- see
   * PytestStagingTestRunner's resolveOnlyTestNames.
   */
  onlyTestNames?: string[];
  /**
   * Set alongside `onlyTestNames` for a rerun -- the quarantined stub
   * rows excluded from `onlyTestNames` (selectQuarantinedCarryForward),
   * carried forward into the new run's own persisted results so its
   * report still accounts for all of the original run's non-passed
   * tests, not just the ones actually re-executed. Never run, just
   * copied through as-is.
   */
  carryForwardResults?: {
    testId: string;
    testName: string;
    passed: boolean;
    details: string;
    sourceUrl?: string;
  }[];
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
 * 30-90+ minutes (100+ real browser tests across 8 personas), so
 * `lockDuration` stays generous (2h) — BullMQ auto-renews the lock well
 * before then as long as the process is alive, so a long-but-healthy run
 * never has its lock genuinely expire.
 *
 * docs/adr/0036 originally set `maxStalledCount: 0` here meaning to
 * express "don't fail a long-but-healthy run over a stall" — that's
 * backwards. Per BullMQ's own moveStalledJobsToWait.lua, a job is only
 * hard-failed once `stalledCount > maxStalledCount`: with `0`, the very
 * *first* stall detection is already fatal (zero tolerance), not "no
 * stalled-job timeout". Confirmed live 2026-09-05: a deploy restarted
 * this container mid-manual-run, killing the job's process and orphaning
 * its lock; the *next* stalled-check (2h later, per the old
 * `stalledInterval`) found the missing lock and immediately
 * hard-failed a job that was really just interrupted by an ordinary
 * deploy, not stuck. `maxStalledCount: 1` (BullMQ's own default) gives a
 * genuinely-orphaned job (this deploy scenario, or a real crash) one
 * automatic retry — safe here specifically because the failure mode that
 * matters (the whole container died) also means there's no live old
 * process left to run concurrently with the retry.
 *
 * `stalledInterval` dropped from 2h to 5 minutes: it only controls how
 * *often* we check for a genuinely missing lock, not how long a healthy
 * job's lock survives (that's `lockDuration`, unchanged) — checking more
 * often doesn't make a false positive on a healthy job more likely, it
 * just means an actually-orphaned job (deploy, crash) gets noticed and
 * retried within minutes instead of leaving the run silently dead for up
 * to 2 hours before anyone finds out.
 */
export function createQaAutomationStagingBullWorker(
  connection: ConnectionOptions,
  processor: Processor<QaAutomationStagingJobData>,
): Worker<QaAutomationStagingJobData> {
  return new Worker<QaAutomationStagingJobData>(QA_AUTOMATION_STAGING_QUEUE_NAME, processor, {
    connection,
    lockDuration: 2 * 60 * 60 * 1000,
    stalledInterval: 5 * 60 * 1000,
    maxStalledCount: 1,
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

/** Producer-side enqueue for "rerun failed/skipped tests from run X" — same one-off shape as a manual run, scoped to `onlyTestNames`. */
export async function enqueueRerunQaAutomationStagingTests(
  queue: Queue<QaAutomationStagingJobData>,
  orgId: string,
  onlyTestNames: string[],
  carryForwardResults?: QaAutomationStagingJobData['carryForwardResults'],
): Promise<void> {
  await queue.add('run-qa-automation-staging-suite', {
    orgId,
    triggeredBy: 'manual',
    onlyTestNames,
    ...(carryForwardResults && carryForwardResults.length > 0 ? { carryForwardResults } : {}),
  });
}
