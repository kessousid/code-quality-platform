import type { UnitTestJobData, UnitTestQueue } from '@cqp/core';

/** Mirrors InMemoryScanQueue exactly (docs/adr/0023). */
export class InMemoryUnitTestQueue implements UnitTestQueue {
  readonly enqueued: UnitTestJobData[] = [];
  readonly cancelled: string[] = [];

  async enqueue(data: UnitTestJobData): Promise<void> {
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
