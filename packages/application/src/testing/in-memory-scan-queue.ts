import type { ScanJobData, ScanQueue } from '@cqp/core';

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
