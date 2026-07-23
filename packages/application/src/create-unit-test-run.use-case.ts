import type {
  CreateUnitTestRunInput,
  RepoRepository,
  UnitTestQueue,
  UnitTestRun,
  UnitTestRunRepository,
} from '@cqp/core';
import { RepoNotFoundError } from './get-repo.use-case.js';

/** Mirrors CreateScanUseCase (docs/adr/0021) exactly — validates the repo exists in this org, creates the row, enqueues the real work. */
export class CreateUnitTestRunUseCase {
  constructor(
    private readonly unitTestRunRepository: UnitTestRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly unitTestQueue: UnitTestQueue,
  ) {}

  async execute(input: CreateUnitTestRunInput): Promise<UnitTestRun> {
    const repo = await this.repoRepository.findById(input.orgId, input.repoId);
    if (!repo) {
      throw new RepoNotFoundError(input.repoId);
    }

    // Defaults to Gemini when omitted (docs/adr/0026) — preserves existing behavior for any caller not using the new selector.
    const run = await this.unitTestRunRepository.create({
      ...input,
      generator: input.generator ?? 'gemini',
    });
    await this.unitTestQueue.enqueue({ orgId: input.orgId, runId: run.id });
    return run;
  }
}
