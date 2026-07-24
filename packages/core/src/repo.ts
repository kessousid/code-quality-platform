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
  /**
   * Which worker instance's filesystem `localPath` actually lives on (see
   * docs/adr/0031) — routes every job for this repo to a queue only that
   * specific worker consumes, so a job never gets picked up by a worker
   * that can't see the right files. Defaults to `'default'`, matching the
   * single-machine setup where the API, worker, and the code all live on
   * the same box and there's only ever one worker to route to.
   */
  workerId: string;
  defaultBranch: string;
  createdAt: Date;
}

export interface CreateRepoInput {
  orgId: string;
  name: string;
  provider?: RepoProvider;
  remoteUrl?: string;
  localPath?: string;
  /** Defaults to 'default' when omitted — resolved in the repository implementation, not here (mirrors CreateUnitTestRunInput's generator field). */
  workerId?: string;
  defaultBranch?: string;
}

export interface RepoRepository {
  create(input: CreateRepoInput): Promise<Repo>;
  findById(orgId: string, id: string): Promise<Repo | null>;
  list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>>;
}
