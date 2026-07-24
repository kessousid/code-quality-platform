import type { UnitTestJobData, UnitTestQueue, UnitTestQueueRegistry } from '@cqp/core';

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

/** Mirrors InMemoryScanQueueRegistry (docs/adr/0031) — a distinct queue per workerId. */
export class InMemoryUnitTestQueueRegistry implements UnitTestQueueRegistry {
  private readonly queues = new Map<string, InMemoryUnitTestQueue>();

  forWorker(workerId: string): InMemoryUnitTestQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new InMemoryUnitTestQueue();
    this.queues.set(workerId, queue);
    return queue;
  }
}
