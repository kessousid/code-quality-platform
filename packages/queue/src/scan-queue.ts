import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { ScanJobData, ScanQueue, ScanQueueRegistry } from '@cqp/core';

/**
 * Shared between `apps/api` (producer) and `apps/worker` (consumer) so
 * both sides agree on the queue name and job shape without one app
 * depending on the other — see docs/adr/0021. This is the only package
 * in the monorepo that imports `bullmq` directly on the producer side;
 * `apps/api`'s own code only ever sees the framework-free `ScanQueue`
 * port from `@cqp/core`.
 *
 * Namespaced by `workerId` (see docs/adr/0031) — a repo's jobs must only
 * ever reach the one worker instance that actually has its files on
 * disk, so each worker gets its own real BullMQ queue rather than every
 * worker instance competing for jobs on one shared queue.
 */
export function scanQueueName(workerId: string): string {
  return `scans:${workerId}`;
}

export function createScanBullQueue(
  connection: ConnectionOptions,
  workerId: string,
): Queue<ScanJobData> {
  return new Queue<ScanJobData>(scanQueueName(workerId), { connection });
}

export function createScanBullWorker(
  connection: ConnectionOptions,
  processor: Processor<ScanJobData>,
  workerId: string,
): Worker<ScanJobData> {
  return new Worker<ScanJobData>(scanQueueName(workerId), processor, { connection });
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

/**
 * Lazily creates and caches one `BullMqScanQueue` (and its underlying real
 * BullMQ `Queue`) per `workerId`, all sharing the same Redis connection —
 * see docs/adr/0031. A `workerId` that's never had a worker actually start
 * for it just accumulates queued jobs harmlessly; nothing here assumes the
 * worker exists yet.
 */
export class BullMqScanQueueRegistry implements ScanQueueRegistry {
  private readonly queues = new Map<string, ScanQueue>();

  constructor(private readonly connection: ConnectionOptions) {}

  forWorker(workerId: string): ScanQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new BullMqScanQueue(createScanBullQueue(this.connection, workerId));
    this.queues.set(workerId, queue);
    return queue;
  }
}
