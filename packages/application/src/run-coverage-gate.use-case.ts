import type {
  CoverageFileResultRepository,
  CoverageRunRepository,
  GitCheckoutProvider,
  RepoRepository,
} from '@cqp/core';
import { runCoverageGate, type CoverageProgressEvent } from '@cqp/coverage-engine';
import { ensureLocalCheckout } from './ensure-local-checkout.js';
import { RepoNotFoundError } from './get-repo.use-case.js';
import { CoverageRunNotFoundError } from './get-coverage-run.use-case.js';

/** How often execute() checks the DB for a cancellation request while running — mirrors RunUnitTestGenerationUseCase (docs/adr/0023, docs/adr/0024). */
const CANCEL_POLL_INTERVAL_MS = 1000;

/**
 * Mirrors RunUnitTestGenerationUseCase's shape closely (docs/adr/0021,
 * 0023, 0024, 0025): same local-checkout requirement, same cross-process
 * DB-polling cancellation bridge, same best-effort progress writes. Zero
 * LLM involvement — `runCoverageGate` runs the repo's own existing Jest
 * suite, nothing gets generated.
 */
export class RunCoverageGateUseCase {
  constructor(
    private readonly coverageRunRepository: CoverageRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly coverageFileResultRepository: CoverageFileResultRepository,
    private readonly checkoutProvider: GitCheckoutProvider,
    private readonly repoTokenDecryptionKey: Buffer,
  ) {}

  async execute(orgId: string, runId: string): Promise<void> {
    const run = await this.coverageRunRepository.findById(orgId, runId);
    if (!run) {
      throw new CoverageRunNotFoundError(runId);
    }
    if (run.status === 'cancelled') {
      return;
    }

    const repo = await this.repoRepository.findById(orgId, run.repoId);
    if (!repo) {
      throw new RepoNotFoundError(run.repoId);
    }

    await this.coverageRunRepository.updateStatus(orgId, runId, 'running');

    const controller = new AbortController();
    const cancelPoll = this.startCancelPoll(orgId, runId, controller);
    const onProgress = this.buildProgressHandler(orgId, runId);

    try {
      // docs/adr/0047: `baseRef` is the diff-comparison target inside the
      // checkout, not what gets checked out — a github/gitlab repo still
      // just clones its default branch.
      const { repoRoot, cleanup } = await ensureLocalCheckout(
        repo,
        undefined,
        this.checkoutProvider,
        this.repoTokenDecryptionKey,
      );
      try {
        const result = await runCoverageGate(repoRoot, run.baseRef, {
          onProgress,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          // Status is already 'cancelled' (CancelCoverageRunUseCase set it) — leave it as-is, skip persisting a partial result.
          return;
        }

        await this.coverageFileResultRepository.saveMany(runId, result.fileResults);
        await this.coverageRunRepository.updateResultsSummary(orgId, runId, {
          testsTotal: result.testsTotal,
          testsPassed: result.testsPassed,
          testsFailed: result.testsFailed,
          changedLinesTotal: result.changedLinesTotal,
          uncoveredLinesTotal: result.uncoveredLinesTotal,
          gatePassed: result.gatePassed,
        });

        await this.coverageRunRepository.updateStatus(orgId, runId, 'completed');
      } finally {
        await cleanup();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        await this.coverageRunRepository.updateStatus(orgId, runId, 'failed', message);
      }
      throw error;
    } finally {
      clearInterval(cancelPoll);
    }
  }

  private startCancelPoll(
    orgId: string,
    runId: string,
    controller: AbortController,
  ): NodeJS.Timeout {
    return setInterval(() => {
      void this.coverageRunRepository.findById(orgId, runId).then((current) => {
        if (current?.status === 'cancelled') {
          controller.abort();
        }
      });
    }, CANCEL_POLL_INTERVAL_MS);
  }

  private buildProgressHandler(
    orgId: string,
    runId: string,
  ): (event: CoverageProgressEvent) => void {
    return (event) => {
      if (event.type === 'total') {
        void this.coverageRunRepository
          .updateProgress(orgId, runId, { filesTotal: event.total, filesCompleted: 0 })
          .catch(() => {});
      }
      // 'running-tests' has no per-file granularity to report — jest runs as one atomic subprocess call.
    };
  }
}
