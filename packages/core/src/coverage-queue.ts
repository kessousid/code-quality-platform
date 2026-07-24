/** Mirrors unit-test-queue.ts (docs/adr/0021, docs/adr/0025) exactly — same reasoning, a separate BullMQ queue/job type. */
export interface CoverageJobData {
  orgId: string;
  runId: string;
}

export interface CoverageQueue {
  enqueue(data: CoverageJobData): Promise<void>;
  cancel(runId: string): Promise<void>;
}

/** Mirrors scan-queue.ts's ScanQueueRegistry (docs/adr/0031) — one real queue per workerId. */
export interface CoverageQueueRegistry {
  forWorker(workerId: string): CoverageQueue;
}
