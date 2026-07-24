import type {
  CoverageQueueRegistry,
  CoverageRun,
  CoverageRunRepository,
  CreateCoverageRunInput,
  RepoRepository,
} from '@cqp/core';
import { RepoNotFoundError } from './get-repo.use-case.js';

/**
 * Mirrors CreateUnitTestRunUseCase (docs/adr/0024, docs/adr/0031) —
 * validates the repo exists, creates the row, enqueues the real work
 * through the queue `repo.workerId` picks.
 *
 * The base ref is deliberately NOT validated here anymore (this used to
 * call `verifyRefExists` upfront, per docs/adr/0025's decision 3) — see
 * docs/adr/0031: once a repo's worker can be a different machine than
 * this API process, "does this ref resolve" is a question about the
 * worker's filesystem, which this process has no way to see. It's
 * validated instead where the answer is actually knowable: inside
 * `RunCoverageGateUseCase`, on the worker that owns the repo, which
 * already fails the run with a clear error message if the ref doesn't
 * resolve there.
 */
export class CreateCoverageRunUseCase {
  constructor(
    private readonly coverageRunRepository: CoverageRunRepository,
    private readonly repoRepository: RepoRepository,
    private readonly coverageQueueRegistry: CoverageQueueRegistry,
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
    const run = await this.coverageRunRepository.create({ ...input, baseRef });
    await this.coverageQueueRegistry
      .forWorker(repo.workerId)
      .enqueue({ orgId: input.orgId, runId: run.id });
    return run;
  }
}
