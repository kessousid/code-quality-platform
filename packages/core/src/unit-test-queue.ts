/** Mirrors scan-queue.ts (docs/adr/0021, docs/adr/0023) exactly — same reasoning, a separate BullMQ queue/job type. */
export interface UnitTestJobData {
  orgId: string;
  runId: string;
  /** See CreateUnitTestRunInput's apiKeyOverride (docs/adr/0037) — carried only as far as the job payload, never written back to the run's own persisted row. */
  apiKeyOverride?: string;
}

export interface UnitTestQueue {
  enqueue(data: UnitTestJobData): Promise<void>;
  cancel(runId: string): Promise<void>;
}

/** Mirrors scan-queue.ts's ScanQueueRegistry (docs/adr/0031) — one real queue per workerId. */
export interface UnitTestQueueRegistry {
  forWorker(workerId: string): UnitTestQueue;
}
