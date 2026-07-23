import type { CreateRepoInput, Repo, RepoRepository } from '@cqp/core';

export class CreateRepoUseCase {
  constructor(private readonly repoRepository: RepoRepository) {}

  async execute(input: CreateRepoInput): Promise<Repo> {
    return this.repoRepository.create(input);
  }
}
