import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { CoverageJobData, CoverageQueue } from '@cqp/core';

/** Mirrors unit-test-queue.ts (docs/adr/0021, docs/adr/0023, docs/adr/0025) — a separate BullMQ queue so a coverage-gate run never blocks scan/unit-test throughput or vice versa. */
export const COVERAGE_QUEUE_NAME = 'coverage-runs';

export function createCoverageBullQueue(connection: ConnectionOptions): Queue<CoverageJobData> {
  return new Queue<CoverageJobData>(COVERAGE_QUEUE_NAME, { connection });
}

export function createCoverageBullWorker(
  connection: ConnectionOptions,
  processor: Processor<CoverageJobData>,
): Worker<CoverageJobData> {
  return new Worker<CoverageJobData>(COVERAGE_QUEUE_NAME, processor, { connection });
}

export class BullMqCoverageQueue implements CoverageQueue {
  constructor(private readonly queue: Queue<CoverageJobData>) {}

  async enqueue(data: CoverageJobData): Promise<void> {
    await this.queue.add('run-coverage-gate', data, { jobId: data.runId });
  }

  async cancel(runId: string): Promise<void> {
    const job = await this.queue.getJob(runId);
    if (!job) return;
    const state = await job.getState();
    if (
      state === 'waiting' ||
      state === 'delayed' ||
      state === 'prioritized' ||
      state === 'waiting-children'
    ) {
      await job.remove();
    }
  }
}
