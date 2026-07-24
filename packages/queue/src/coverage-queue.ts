import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { CoverageJobData, CoverageQueue, CoverageQueueRegistry } from '@cqp/core';

/**
 * Mirrors unit-test-queue.ts (docs/adr/0021, docs/adr/0023, docs/adr/0025,
 * docs/adr/0031) — a separate BullMQ queue so a coverage-gate run never
 * blocks scan/unit-test throughput or vice versa, namespaced by workerId
 * so a job never reaches a worker that can't see the repo's files.
 * Separated by `-`, not `:` — see scan-queue.ts's scanQueueName for why.
 */
export function coverageQueueName(workerId: string): string {
  return `coverage-runs-${workerId}`;
}

export function createCoverageBullQueue(
  connection: ConnectionOptions,
  workerId: string,
): Queue<CoverageJobData> {
  return new Queue<CoverageJobData>(coverageQueueName(workerId), { connection });
}

export function createCoverageBullWorker(
  connection: ConnectionOptions,
  processor: Processor<CoverageJobData>,
  workerId: string,
): Worker<CoverageJobData> {
  return new Worker<CoverageJobData>(coverageQueueName(workerId), processor, { connection });
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

/** Mirrors BullMqScanQueueRegistry (docs/adr/0031) — one real queue per workerId, lazily created and cached. */
export class BullMqCoverageQueueRegistry implements CoverageQueueRegistry {
  private readonly queues = new Map<string, CoverageQueue>();

  constructor(private readonly connection: ConnectionOptions) {}

  forWorker(workerId: string): CoverageQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new BullMqCoverageQueue(createCoverageBullQueue(this.connection, workerId));
    this.queues.set(workerId, queue);
    return queue;
  }
}
