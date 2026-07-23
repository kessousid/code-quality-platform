import type {
  GeneratedTestFileRepository,
  JestTestGenerator,
  RepoRepository,
  TestCaseResultRepository,
  TestGeneratorType,
  UnitTestRunRepository,
} from '@cqp/core';
import { runUnitTestGeneration, type UnitTestProgressEvent } from '@cqp/unit-test-engine';
import { RepoNotFoundError } from './get-repo.use-case.js';
import { UnitTestRunNotFoundError } from './get-unit-test-run.use-case.js';

/** How often execute() checks the DB for a cancellation request while running — mirrors RunScanUseCase (docs/adr/0023). */
const CANCEL_POLL_INTERVAL_MS = 1000;

/**
 * Mirrors RunScanUseCase's shape closely (see docs/adr/0021, 0023, 0024):
 * same local-checkout requirement, same cross-process DB-polling
 * cancellation bridge, same best-effort progress writes. The one thing
 * genuinely new here is the LLM call inside `runUnitTestGeneration` —
 * everything else is the same "long-running worker job" problem this
 * platform has already solved once for scans.
 *
 * `generators` is a registry, not a single instance (docs/adr/0026) —
 * which concrete `JestTestGenerator` runs is a per-run choice
 * (`run.generator`), not fixed at construction time, so this use case can
 * serve both the Gemini-backed and the deterministic script-backed run
 * without knowing which one it's about to use until the run loads.
 */
export class RunUnitTestGenerationUseCase {
  constructor(
    private readonly unitTestRunRepository: UnitTestRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly generatedTestFileRepository: GeneratedTestFileRepository,
    private readonly testCaseResultRepository: TestCaseResultRepository,
    private readonly generators: Record<TestGeneratorType, JestTestGenerator>,
  ) {}

  async execute(orgId: string, runId: string): Promise<void> {
    const run = await this.unitTestRunRepository.findById(orgId, runId);
    if (!run) {
      throw new UnitTestRunNotFoundError(runId);
    }
    if (run.status === 'cancelled') {
      return;
    }

    const repo = await this.repoRepository.findById(orgId, run.repoId);
    if (!repo) {
      throw new RepoNotFoundError(run.repoId);
    }

    if (repo.provider !== 'local' || repo.localPath === undefined) {
      await this.unitTestRunRepository.updateStatus(
        orgId,
        runId,
        'failed',
        'Repo has no local checkout to scan.',
      );
      throw new Error(
        `Repo ${repo.id} has no local checkout to generate tests against (provider=${repo.provider}, localPath=${repo.localPath ?? 'unset'})`,
      );
    }

    await this.unitTestRunRepository.updateStatus(orgId, runId, 'running');

    const controller = new AbortController();
    const cancelPoll = this.startCancelPoll(orgId, runId, controller);
    const onProgress = this.buildProgressHandler(orgId, runId);

    try {
      const generator = this.generators[run.generator];
      const result = await runUnitTestGeneration(repo.localPath, run.target, generator, {
        onProgress,
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        // Status is already 'cancelled' (CancelUnitTestRunUseCase set it) — leave it as-is, skip persisting a partial result.
        return;
      }

      await this.generatedTestFileRepository.saveMany(runId, result.generatedFiles);
      await this.testCaseResultRepository.saveMany(runId, result.testResults);
      await this.unitTestRunRepository.updateResultsSummary(orgId, runId, {
        testsTotal: result.testsTotal,
        testsPassed: result.testsPassed,
        testsFailed: result.testsFailed,
      });

      await this.unitTestRunRepository.updateStatus(orgId, runId, 'completed');
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        await this.unitTestRunRepository.updateStatus(orgId, runId, 'failed', message);
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
      void this.unitTestRunRepository.findById(orgId, runId).then((current) => {
        if (current?.status === 'cancelled') {
          controller.abort();
        }
      });
    }, CANCEL_POLL_INTERVAL_MS);
  }

  private buildProgressHandler(
    orgId: string,
    runId: string,
  ): (event: UnitTestProgressEvent) => void {
    let completedCount = 0;
    return (event) => {
      if (event.type === 'total') {
        void this.unitTestRunRepository
          .updateProgress(orgId, runId, { filesTotal: event.total, filesCompleted: 0 })
          .catch(() => {});
      } else if (event.type === 'file-start') {
        void this.unitTestRunRepository
          .updateProgress(orgId, runId, { currentFilePath: event.filePath })
          .catch(() => {});
      } else {
        completedCount += 1;
        void this.unitTestRunRepository
          .updateProgress(orgId, runId, { filesCompleted: completedCount })
          .catch(() => {});
      }
    };
  }
}
