import type { PaginatedResult, PaginationParams } from './pagination.js';

export type RepoProvider = 'local' | 'github' | 'gitlab';

export interface Repo {
  id: string;
  orgId: string;
  name: string;
  provider: RepoProvider;
  remoteUrl?: string;
  /**
   * Absolute path on the worker's filesystem — see docs/adr/0021. Only a
   * `local` repo with this set is actually scannable; there is no
   * clone-from-remote mechanism yet (ADR-0003 defers live VCS integration).
   */
  localPath?: string;
  defaultBranch: string;
  createdAt: Date;
}

export interface CreateRepoInput {
  orgId: string;
  name: string;
  provider?: RepoProvider;
  remoteUrl?: string;
  localPath?: string;
  defaultBranch?: string;
}

export interface RepoRepository {
  create(input: CreateRepoInput): Promise<Repo>;
  findById(orgId: string, id: string): Promise<Repo | null>;
  list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>>;
}
