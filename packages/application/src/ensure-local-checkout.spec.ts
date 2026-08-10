import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ensureLocalCheckout } from './ensure-local-checkout.js';
import { encryptRepoToken } from './repo-token-cipher.js';
import { InMemoryRepoRepository } from './testing/in-memory-repo-repository.js';
import { FakeGitCheckoutProvider } from './testing/fake-git-checkout-provider.js';

const KEY = randomBytes(32);

describe('ensureLocalCheckout', () => {
  it('returns the existing localPath unchanged for a local repo, with a no-op cleanup', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'local-repo',
      localPath: '/home/dev/my-project',
    });
    const checkoutProvider = new FakeGitCheckoutProvider();

    const result = await ensureLocalCheckout(repo, 'main', checkoutProvider, KEY);

    expect(result.repoRoot).toBe('/home/dev/my-project');
    expect(checkoutProvider.checkoutCalls).toHaveLength(0);
    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it('throws the same "no local checkout" error a local repo with no localPath always has', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' });
    const checkoutProvider = new FakeGitCheckoutProvider();

    await expect(ensureLocalCheckout(repo, undefined, checkoutProvider, KEY)).rejects.toThrow(
      /no local checkout to scan/,
    );
  });

  it('delegates to the checkout provider for a github repo, with no token when none is set', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'public-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/public-repo.git',
    });
    const checkoutProvider = new FakeGitCheckoutProvider();

    const result = await ensureLocalCheckout(repo, 'main', checkoutProvider, KEY);

    expect(result.repoRoot).toBe(checkoutProvider.repoRoot);
    expect(checkoutProvider.checkoutCalls).toHaveLength(1);
    expect(checkoutProvider.checkoutCalls[0]?.accessToken).toBeUndefined();
    expect(checkoutProvider.checkoutCalls[0]?.ref).toBe('main');
  });

  it('decrypts a real access token and passes the plaintext to the checkout provider, never the ciphertext', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const encrypted = encryptRepoToken('ghp_realtoken', KEY);
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
      encryptedAccessToken: encrypted,
    });
    const checkoutProvider = new FakeGitCheckoutProvider();

    await ensureLocalCheckout(repo, undefined, checkoutProvider, KEY);

    expect(checkoutProvider.checkoutCalls[0]?.accessToken).toBe('ghp_realtoken');
  });

  it('calling cleanup on a real checkout result invokes the provider-supplied cleanup', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'public-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/public-repo.git',
    });
    const checkoutProvider = new FakeGitCheckoutProvider();

    const result = await ensureLocalCheckout(repo, undefined, checkoutProvider, KEY);
    await result.cleanup();

    expect(checkoutProvider.cleanupCalls).toBe(1);
  });
});
