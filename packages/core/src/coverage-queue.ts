/** Mirrors unit-test-queue.ts (docs/adr/0021, docs/adr/0025) exactly — same reasoning, a separate BullMQ queue/job type. */
export interface CoverageJobData {
  orgId: string;
  runId: string;
}

export interface CoverageQueue {
  enqueue(data: CoverageJobData): Promise<void>;
  cancel(runId: string): Promise<void>;
}
