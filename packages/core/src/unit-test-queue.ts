/** Mirrors scan-queue.ts (docs/adr/0021, docs/adr/0023) exactly — same reasoning, a separate BullMQ queue/job type. */
export interface UnitTestJobData {
  orgId: string;
  runId: string;
}

export interface UnitTestQueue {
  enqueue(data: UnitTestJobData): Promise<void>;
  cancel(runId: string): Promise<void>;
}

/** Mirrors scan-queue.ts's ScanQueueRegistry (docs/adr/0031) — one real queue per workerId. */
export interface UnitTestQueueRegistry {
  forWorker(workerId: string): UnitTestQueue;
}
