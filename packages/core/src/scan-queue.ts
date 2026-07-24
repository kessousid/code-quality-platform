/**
 * Port `CreateScanUseCase` enqueues through after creating a `Scan` row —
 * see docs/adr/0021. `apps/api` provides the real BullMQ-backed adapter;
 * `apps/worker` consumes the same queue name/job shape on the other end.
 * Framework-free here (ADR-0010) — no BullMQ import in this package.
 */
export interface ScanJobData {
  orgId: string;
  scanId: string;
}

export interface ScanQueue {
  enqueue(data: ScanJobData): Promise<void>;
  /**
   * Removes a not-yet-started job so a queued scan never runs (see
   * docs/adr/0023). A no-op if the job already started or was never
   * found — cancelling an in-flight scan is handled cooperatively inside
   * `RunScanUseCase`, not here.
   */
  cancel(scanId: string): Promise<void>;
}

/**
 * One real queue per `workerId` (see docs/adr/0031) — a repo's jobs must
 * only ever reach the one worker instance that actually has its files on
 * disk. Producers (the Create/Cancel use cases) resolve `forWorker(repo.workerId)`
 * once they have the repo in hand, rather than depending on a single
 * fixed `ScanQueue` the way earlier code did.
 */
export interface ScanQueueRegistry {
  forWorker(workerId: string): ScanQueue;
}
