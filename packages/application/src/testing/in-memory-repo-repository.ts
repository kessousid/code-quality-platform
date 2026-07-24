import { randomUUID } from 'node:crypto';
import type {
  CreateRepoInput,
  PaginatedResult,
  PaginationParams,
  Repo,
  RepoRepository,
} from '@cqp/core';

export class InMemoryRepoRepository implements RepoRepository {
  private readonly repos = new Map<string, Repo>();

  async create(input: CreateRepoInput): Promise<Repo> {
    const repo: Repo = {
      id: randomUUID(),
      orgId: input.orgId,
      name: input.name,
      provider: input.provider ?? 'local',
      workerId: input.workerId ?? 'default',
      defaultBranch: input.defaultBranch ?? 'main',
      createdAt: new Date(),
      ...(input.remoteUrl !== undefined ? { remoteUrl: input.remoteUrl } : {}),
      ...(input.localPath !== undefined ? { localPath: input.localPath } : {}),
    };
    this.repos.set(repo.id, repo);
    return repo;
  }

  async findById(orgId: string, id: string): Promise<Repo | null> {
    const repo = this.repos.get(id);
    if (!repo || repo.orgId !== orgId) {
      return null;
    }
    return repo;
  }

  async list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>> {
    const all = [...this.repos.values()].filter((r) => r.orgId === orgId);
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: all.slice(start, start + pagination.pageSize),
      total: all.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
