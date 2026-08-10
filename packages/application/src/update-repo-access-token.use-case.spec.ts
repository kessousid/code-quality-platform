import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UpdateRepoAccessTokenUseCase } from './update-repo-access-token.use-case.js';
import { decryptRepoToken } from './repo-token-cipher.js';
import { RepoNotFoundError } from './get-repo.use-case.js';
import { InMemoryRepoRepository } from './testing/in-memory-repo-repository.js';

const KEY = randomBytes(32);

describe('UpdateRepoAccessTokenUseCase', () => {
  it('encrypts a new token and stores it, never the plaintext', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
    });
    const useCase = new UpdateRepoAccessTokenUseCase(repoRepository, KEY);

    const updated = await useCase.execute('org_1', repo.id, 'ghp_newtoken');

    expect(updated.encryptedAccessToken).not.toContain('ghp_newtoken');
    expect(decryptRepoToken(updated.encryptedAccessToken!, KEY)).toBe('ghp_newtoken');
  });

  it('clears a previously-set token when given null', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
      encryptedAccessToken: 'some-existing-ciphertext',
    });
    const useCase = new UpdateRepoAccessTokenUseCase(repoRepository, KEY);

    const updated = await useCase.execute('org_1', repo.id, null);

    expect(updated.encryptedAccessToken).toBeUndefined();
  });

  it('throws RepoNotFoundError for a repo that does not exist in this org', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const useCase = new UpdateRepoAccessTokenUseCase(repoRepository, KEY);

    await expect(useCase.execute('org_1', 'nonexistent-id', 'ghp_x')).rejects.toThrow(
      RepoNotFoundError,
    );
  });
});
