import type { Repo, RepoRepository } from '@cqp/core';

export class RepoNotFoundError extends Error {
  constructor(repoId: string) {
    super(`Repo not found: ${repoId}`);
    this.name = 'RepoNotFoundError';
  }
}

export class GetRepoUseCase {
  constructor(private readonly repoRepository: RepoRepository) {}

  async execute(orgId: string, repoId: string): Promise<Repo> {
    const repo = await this.repoRepository.findById(orgId, repoId);
    if (!repo) {
      throw new RepoNotFoundError(repoId);
    }
    return repo;
  }
}
