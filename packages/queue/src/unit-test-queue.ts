import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { UnitTestJobData, UnitTestQueue } from '@cqp/core';

/** Mirrors scan-queue.ts (docs/adr/0021, docs/adr/0023) — a separate BullMQ queue so a slow LLM-backed unit-test run never blocks scan throughput or vice versa. */
export const UNIT_TEST_QUEUE_NAME = 'unit-tests';

export function createUnitTestBullQueue(connection: ConnectionOptions): Queue<UnitTestJobData> {
  return new Queue<UnitTestJobData>(UNIT_TEST_QUEUE_NAME, { connection });
}

export function createUnitTestBullWorker(
  connection: ConnectionOptions,
  processor: Processor<UnitTestJobData>,
): Worker<UnitTestJobData> {
  return new Worker<UnitTestJobData>(UNIT_TEST_QUEUE_NAME, processor, { connection });
}

export class BullMqUnitTestQueue implements UnitTestQueue {
  constructor(private readonly queue: Queue<UnitTestJobData>) {}

  async enqueue(data: UnitTestJobData): Promise<void> {
    await this.queue.add('run-unit-tests', data, { jobId: data.runId });
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
