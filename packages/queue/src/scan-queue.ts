import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { ScanJobData, ScanQueue } from '@cqp/core';

/**
 * Shared between `apps/api` (producer) and `apps/worker` (consumer) so
 * both sides agree on the queue name and job shape without one app
 * depending on the other — see docs/adr/0021. This is the only package
 * in the monorepo that imports `bullmq` directly on the producer side;
 * `apps/api`'s own code only ever sees the framework-free `ScanQueue`
 * port from `@cqp/core`.
 */
export const SCAN_QUEUE_NAME = 'scans';

export function createScanBullQueue(connection: ConnectionOptions): Queue<ScanJobData> {
  return new Queue<ScanJobData>(SCAN_QUEUE_NAME, { connection });
}

export function createScanBullWorker(
  connection: ConnectionOptions,
  processor: Processor<ScanJobData>,
): Worker<ScanJobData> {
  return new Worker<ScanJobData>(SCAN_QUEUE_NAME, processor, { connection });
}

/** The `ScanQueue` port's real adapter — everything else in `apps/api` depends on the port, not on this class or on BullMQ. */
export class BullMqScanQueue implements ScanQueue {
  constructor(private readonly queue: Queue<ScanJobData>) {}

  async enqueue(data: ScanJobData): Promise<void> {
    // A fixed jobId (the scanId itself) is what lets `cancel()` look the
    // job up later without a separate id-mapping table (see docs/adr/0023).
    await this.queue.add('run-scan', data, { jobId: data.scanId });
  }

  async cancel(scanId: string): Promise<void> {
    const job = await this.queue.getJob(scanId);
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
    // An already-'active' job can't be removed from here — RunScanUseCase's
    // own DB-polling loop is what actually stops a running scan.
  }
}
