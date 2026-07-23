import type { PaginatedResult, PaginationParams, Repo, RepoRepository } from '@cqp/core';

export class ListReposUseCase {
  constructor(private readonly repoRepository: RepoRepository) {}

  async execute(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>> {
    return this.repoRepository.list(orgId, pagination);
  }
}
