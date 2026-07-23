import type { Scan, ScanQueue, ScanRepository } from '@cqp/core';
import { ScanNotFoundError } from './get-scan.use-case.js';

const TERMINAL_STATUSES: Scan['status'][] = ['completed', 'failed', 'cancelled'];

/**
 * See docs/adr/0023. A `queued` scan is removed from the queue outright —
 * it never starts. A `running` scan is flipped to `cancelled` here and
 * actually stopped by `RunScanUseCase`'s own DB-polling loop, since the
 * cancel request (API process) and the scan (worker process) are
 * different processes with no other shared channel.
 */
export class CancelScanUseCase {
  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly scanQueue: ScanQueue,
  ) {}

  async execute(orgId: string, scanId: string): Promise<Scan> {
    const scan = await this.scanRepository.findById(orgId, scanId);
    if (!scan) {
      throw new ScanNotFoundError(scanId);
    }
    if (TERMINAL_STATUSES.includes(scan.status)) {
      return scan;
    }

    if (scan.status === 'queued') {
      await this.scanQueue.cancel(scanId);
    }

    return this.scanRepository.updateStatus(orgId, scanId, 'cancelled');
  }
}
