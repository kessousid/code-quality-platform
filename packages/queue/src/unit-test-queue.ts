import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { UnitTestJobData, UnitTestQueue, UnitTestQueueRegistry } from '@cqp/core';

/**
 * Mirrors scan-queue.ts (docs/adr/0021, docs/adr/0023, docs/adr/0031) — a
 * separate BullMQ queue so a slow LLM-backed unit-test run never blocks
 * scan throughput or vice versa, namespaced by workerId so a job never
 * reaches a worker that can't see the repo's files. Separated by `-`,
 * not `:` — see scan-queue.ts's scanQueueName for why.
 */
export function unitTestQueueName(workerId: string): string {
  return `unit-tests-${workerId}`;
}

export function createUnitTestBullQueue(
  connection: ConnectionOptions,
  workerId: string,
): Queue<UnitTestJobData> {
  return new Queue<UnitTestJobData>(unitTestQueueName(workerId), { connection });
}

export function createUnitTestBullWorker(
  connection: ConnectionOptions,
  processor: Processor<UnitTestJobData>,
  workerId: string,
): Worker<UnitTestJobData> {
  return new Worker<UnitTestJobData>(unitTestQueueName(workerId), processor, { connection });
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

/** Mirrors BullMqScanQueueRegistry (docs/adr/0031) — one real queue per workerId, lazily created and cached. */
export class BullMqUnitTestQueueRegistry implements UnitTestQueueRegistry {
  private readonly queues = new Map<string, UnitTestQueue>();

  constructor(private readonly connection: ConnectionOptions) {}

  forWorker(workerId: string): UnitTestQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new BullMqUnitTestQueue(createUnitTestBullQueue(this.connection, workerId));
    this.queues.set(workerId, queue);
    return queue;
  }
}
