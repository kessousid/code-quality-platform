import type { UnitTestQueue, UnitTestRun, UnitTestRunRepository } from '@cqp/core';
import { UnitTestRunNotFoundError } from './get-unit-test-run.use-case.js';

const TERMINAL_STATUSES: UnitTestRun['status'][] = ['completed', 'failed', 'cancelled'];

/** Mirrors CancelScanUseCase (docs/adr/0023) exactly — same reasoning applies unchanged. */
export class CancelUnitTestRunUseCase {
  constructor(
    private readonly unitTestRunRepository: UnitTestRunRepository,
    private readonly unitTestQueue: UnitTestQueue,
  ) {}

  async execute(orgId: string, runId: string): Promise<UnitTestRun> {
    const run = await this.unitTestRunRepository.findById(orgId, runId);
    if (!run) {
      throw new UnitTestRunNotFoundError(runId);
    }
    if (TERMINAL_STATUSES.includes(run.status)) {
      return run;
    }

    if (run.status === 'queued') {
      await this.unitTestQueue.cancel(runId);
    }

    return this.unitTestRunRepository.updateStatus(orgId, runId, 'cancelled');
  }
}
