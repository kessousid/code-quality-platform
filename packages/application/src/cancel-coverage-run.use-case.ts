import type { CoverageQueue, CoverageRun, CoverageRunRepository } from '@cqp/core';
import { CoverageRunNotFoundError } from './get-coverage-run.use-case.js';

const TERMINAL_STATUSES: CoverageRun['status'][] = ['completed', 'failed', 'cancelled'];

/** Mirrors CancelUnitTestRunUseCase (docs/adr/0023, docs/adr/0025) exactly — same reasoning applies unchanged. */
export class CancelCoverageRunUseCase {
  constructor(
    private readonly coverageRunRepository: CoverageRunRepository,
    private readonly coverageQueue: CoverageQueue,
  ) {}

  async execute(orgId: string, runId: string): Promise<CoverageRun> {
    const run = await this.coverageRunRepository.findById(orgId, runId);
    if (!run) {
      throw new CoverageRunNotFoundError(runId);
    }
    if (TERMINAL_STATUSES.includes(run.status)) {
      return run;
    }

    if (run.status === 'queued') {
      await this.coverageQueue.cancel(runId);
    }

    return this.coverageRunRepository.updateStatus(orgId, runId, 'cancelled');
  }
}
