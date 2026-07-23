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
