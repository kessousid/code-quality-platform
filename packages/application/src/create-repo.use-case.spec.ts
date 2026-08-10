import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CreateRepoUseCase } from './create-repo.use-case.js';
import { decryptRepoToken } from './repo-token-cipher.js';
import { InMemoryRepoRepository } from './testing/in-memory-repo-repository.js';

const KEY = randomBytes(32);

describe('CreateRepoUseCase', () => {
  it('creates a local repo unchanged, keeping whatever workerId was requested', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const useCase = new CreateRepoUseCase(repoRepository, KEY);

    const repo = await useCase.execute({
      orgId: 'org_1',
      name: 'my-project',
      localPath: '/home/dev/my-project',
      workerId: 'keshav-laptop',
    });

    expect(repo.provider).toBe('local');
    expect(repo.workerId).toBe('keshav-laptop');
    expect(repo.encryptedAccessToken).toBeUndefined();
  });

  it('encrypts a real access token before it ever reaches the repository, never storing plaintext', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const useCase = new CreateRepoUseCase(repoRepository, KEY);

    const repo = await useCase.execute({
      orgId: 'org_1',
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
      accessToken: 'ghp_realtoken1234',
    });

    expect(repo.encryptedAccessToken).toBeDefined();
    expect(repo.encryptedAccessToken).not.toContain('ghp_realtoken1234');
    expect(decryptRepoToken(repo.encryptedAccessToken!, KEY)).toBe('ghp_realtoken1234');
  });

  it('forces workerId to "default" for a github repo, ignoring any requested workerId', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const useCase = new CreateRepoUseCase(repoRepository, KEY);

    const repo = await useCase.execute({
      orgId: 'org_1',
      name: 'public-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/public-repo.git',
      workerId: 'some-users-laptop',
    });

    expect(repo.workerId).toBe('default');
  });

  it('creates a github repo with no access token when none is given (a public repo)', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const useCase = new CreateRepoUseCase(repoRepository, KEY);

    const repo = await useCase.execute({
      orgId: 'org_1',
      name: 'public-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/public-repo.git',
    });

    expect(repo.encryptedAccessToken).toBeUndefined();
  });
});
