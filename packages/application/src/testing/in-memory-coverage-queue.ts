import type { CoverageJobData, CoverageQueue } from '@cqp/core';

/** Mirrors InMemoryUnitTestQueue exactly (docs/adr/0023, docs/adr/0025). */
export class InMemoryCoverageQueue implements CoverageQueue {
  readonly enqueued: CoverageJobData[] = [];
  readonly cancelled: string[] = [];

  async enqueue(data: CoverageJobData): Promise<void> {
    this.enqueued.push(data);
  }

  async cancel(runId: string): Promise<void> {
    this.cancelled.push(runId);
    const index = this.enqueued.findIndex((job) => job.runId === runId);
    if (index !== -1) {
      this.enqueued.splice(index, 1);
    }
  }
}
