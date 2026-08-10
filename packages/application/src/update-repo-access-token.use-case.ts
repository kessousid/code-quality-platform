import type { Repo, RepoRepository } from '@cqp/core';
import { encryptRepoToken } from './repo-token-cipher.js';
import { RepoNotFoundError } from './get-repo.use-case.js';

/** Rotates or clears a repo's PAT after creation (docs/adr/0047) — without recreating the repo. */
export class UpdateRepoAccessTokenUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoTokenEncryptionKey: Buffer,
  ) {}

  /** `accessToken: null` clears a previously-set token. */
  async execute(orgId: string, repoId: string, accessToken: string | null): Promise<Repo> {
    const existing = await this.repoRepository.findById(orgId, repoId);
    if (!existing) {
      throw new RepoNotFoundError(repoId);
    }
    const encrypted =
      accessToken === null ? null : encryptRepoToken(accessToken, this.repoTokenEncryptionKey);
    return this.repoRepository.updateAccessToken(orgId, repoId, encrypted);
  }
}
