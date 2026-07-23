import type {
  CoverageQueue,
  CoverageRun,
  CoverageRunRepository,
  CreateCoverageRunInput,
  RepoRepository,
} from '@cqp/core';
import { verifyRefExists } from '@cqp/scan-engine';
import { RepoNotFoundError } from './get-repo.use-case.js';

export class BaseRefNotFoundError extends Error {
  constructor(baseRef: string) {
    super(`Base ref "${baseRef}" does not resolve in this repo's local checkout.`);
    this.name = 'BaseRefNotFoundError';
  }
}

/**
 * Mirrors CreateUnitTestRunUseCase (docs/adr/0024) — validates the repo
 * exists, creates the row, enqueues the real work. The one addition: the
 * base ref is validated upfront (docs/adr/0025's decision 3), so a typo'd
 * or unfetched branch name is rejected immediately rather than discovered
 * mid-run by the worker.
 */
export class CreateCoverageRunUseCase {
  constructor(
    private readonly coverageRunRepository: CoverageRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly coverageQueue: CoverageQueue,
  ) {}

  async execute(input: CreateCoverageRunInput): Promise<CoverageRun> {
    const repo = await this.repoRepository.findById(input.orgId, input.repoId);
    if (!repo) {
      throw new RepoNotFoundError(input.repoId);
    }
    if (repo.provider !== 'local' || repo.localPath === undefined) {
      throw new Error(
        `Repo ${repo.id} has no local checkout to diff against (provider=${repo.provider}).`,
      );
    }

    const baseRef = input.baseRef ?? repo.defaultBranch;
    if (!(await verifyRefExists(repo.localPath, baseRef))) {
      throw new BaseRefNotFoundError(baseRef);
    }

    const run = await this.coverageRunRepository.create({ ...input, baseRef });
    await this.coverageQueue.enqueue({ orgId: input.orgId, runId: run.id });
    return run;
  }
}
