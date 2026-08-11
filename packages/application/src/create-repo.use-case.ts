import type { CreateRepoInput, Repo, RepoProvider, RepoRepository } from '@cqp/core';
import { encryptRepoToken } from './repo-token-cipher.js';
import { HomeDirectoryLocalPathError, looksLikeHomeDirectory } from './local-path-validation.js';

export interface CreateRepoUseCaseInput extends Omit<CreateRepoInput, 'encryptedAccessToken'> {
  /** Plaintext, in memory only for this call — encrypted below before it ever reaches a `RepoRepository` (docs/adr/0047). */
  accessToken?: string;
}

const GIT_HOSTED_PROVIDERS: RepoProvider[] = ['github', 'gitlab'];

/**
 * A `github`/`gitlab` repo is always routed to Railway's own `'default'`
 * worker (docs/adr/0047) — that's the one instance that actually clones
 * it, so a user-supplied `workerId` for this provider would only ever
 * point at a machine with no local checkout to find. A `'local'` repo
 * keeps whatever `workerId` was requested, exactly as today.
 */
function resolveWorkerId(input: CreateRepoUseCaseInput): string | undefined {
  if (input.provider && GIT_HOSTED_PROVIDERS.includes(input.provider)) {
    return 'default';
  }
  return input.workerId;
}

export class CreateRepoUseCase {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly repoTokenEncryptionKey: Buffer,
  ) {}

  async execute(input: CreateRepoUseCaseInput): Promise<Repo> {
    if (input.localPath !== undefined && looksLikeHomeDirectory(input.localPath)) {
      throw new HomeDirectoryLocalPathError(input.localPath);
    }
    const { accessToken, ...rest } = input;
    const resolvedWorkerId = resolveWorkerId(input);
    return this.repoRepository.create({
      ...rest,
      ...(resolvedWorkerId !== undefined ? { workerId: resolvedWorkerId } : {}),
      ...(accessToken !== undefined
        ? { encryptedAccessToken: encryptRepoToken(accessToken, this.repoTokenEncryptionKey) }
        : {}),
    });
  }
}
