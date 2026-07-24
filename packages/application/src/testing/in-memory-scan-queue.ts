import type { ScanJobData, ScanQueue, ScanQueueRegistry } from '@cqp/core';

/** Records what was enqueued without running anything — the real point of a queue is decoupling creation from execution; this double preserves that in tests. */
export class InMemoryScanQueue implements ScanQueue {
  readonly enqueued: ScanJobData[] = [];
  readonly cancelled: string[] = [];

  async enqueue(data: ScanJobData): Promise<void> {
    this.enqueued.push(data);
  }

  async cancel(scanId: string): Promise<void> {
    this.cancelled.push(scanId);
    const index = this.enqueued.findIndex((job) => job.scanId === scanId);
    if (index !== -1) {
      this.enqueued.splice(index, 1);
    }
  }
}

/** Mirrors BullMqScanQueueRegistry's per-workerId isolation (docs/adr/0031) — a distinct InMemoryScanQueue per workerId, so tests can assert a job landed in the right worker's queue and not another's. */
export class InMemoryScanQueueRegistry implements ScanQueueRegistry {
  private readonly queues = new Map<string, InMemoryScanQueue>();

  forWorker(workerId: string): InMemoryScanQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new InMemoryScanQueue();
    this.queues.set(workerId, queue);
    return queue;
  }
}
