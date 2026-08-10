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
   * `local` repo with this set is actually scannable via a pre-existing
   * checkout. A `github`/`gitlab` repo instead gets a fresh clone at run
   * time via `GitCheckoutProvider` (docs/adr/0047) — `ensureLocalCheckout`
   * is what decides which of the two applies.
   */
  localPath?: string;
  /**
   * Opaque ciphertext (AES-256-GCM, see `encryptRepoToken`/`decryptRepoToken`
   * in @cqp/application) — never the raw PAT. This layer never decrypts
   * it; only `ensureLocalCheckout` does, immediately before a clone.
   */
  encryptedAccessToken?: string;
  /**
   * Which worker instance's filesystem `localPath` actually lives on (see
   * docs/adr/0031) — routes every job for this repo to a queue only that
   * specific worker consumes, so a job never gets picked up by a worker
   * that can't see the right files. Defaults to `'default'`, matching the
   * single-machine setup where the API, worker, and the code all live on
   * the same box and there's only ever one worker to route to. A
   * `github`/`gitlab` repo is always forced to `'default'` regardless of
   * what's requested (docs/adr/0047) — that's the one worker instance
   * Railway itself always runs, which is what actually does the cloning.
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
  /**
   * Already encrypted — this port never sees a raw PAT, same discipline as
   * `CreateUserInput.passwordHash` (docs/adr/0047). `CreateRepoUseCase`
   * accepts a separate, plaintext-`accessToken` input shape and encrypts
   * it before ever constructing one of these.
   */
  encryptedAccessToken?: string;
  /** Defaults to 'default' when omitted — resolved in the repository implementation, not here (mirrors CreateUnitTestRunInput's generator field). */
  workerId?: string;
  defaultBranch?: string;
}

export interface RepoRepository {
  create(input: CreateRepoInput): Promise<Repo>;
  findById(orgId: string, id: string): Promise<Repo | null>;
  list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>>;
  /** `null` clears a previously-set token (e.g. rotating away from a private repo, or revoking access). */
  updateAccessToken(orgId: string, id: string, encryptedAccessToken: string | null): Promise<Repo>;
}
