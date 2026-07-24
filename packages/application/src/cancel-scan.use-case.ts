import type { RepoRepository, Scan, ScanQueueRegistry, ScanRepository } from '@cqp/core';
import { ScanNotFoundError } from './get-scan.use-case.js';

const TERMINAL_STATUSES: Scan['status'][] = ['completed', 'failed', 'cancelled'];

/**
 * See docs/adr/0023. A `queued` scan is removed from the queue outright —
 * it never starts. A `running` scan is flipped to `cancelled` here and
 * actually stopped by `RunScanUseCase`'s own DB-polling loop, since the
 * cancel request (API process) and the scan (worker process) are
 * different processes with no other shared channel.
 *
 * docs/adr/0031: the job was enqueued to whichever worker owns the
 * repo, so cancelling it means fetching the repo again to recover
 * `workerId` and resolving the same queue instance from the registry —
 * a `CreateScanUseCase`-style repo lookup this use case didn't need
 * before per-worker routing existed.
 */
export class CancelScanUseCase {
  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly repoRepository: RepoRepository,
    private readonly scanQueueRegistry: ScanQueueRegistry,
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
      const repo = await this.repoRepository.findById(orgId, scan.repoId);
      // A missing repo (e.g. deleted since the scan was created) leaves nothing to route a cancel to —
      // the status update below still happens, same practical effect as removing an already-gone job.
      if (repo) {
        await this.scanQueueRegistry.forWorker(repo.workerId).cancel(scanId);
      }
    }

    return this.scanRepository.updateStatus(orgId, scanId, 'cancelled');
  }
}
