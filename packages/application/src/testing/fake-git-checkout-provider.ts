import type { GitCheckout, GitCheckoutProvider, Repo } from '@cqp/core';

/** Configurable fake — never spawns a real `git clone`, unlike GitCloneCheckoutProvider. */
export class FakeGitCheckoutProvider implements GitCheckoutProvider {
  repoRoot = '/tmp/fake-checkout';
  cleanupCalls = 0;
  checkoutCalls: { repo: Repo; accessToken: string | undefined; ref: string | undefined }[] = [];
  error: Error | undefined;

  async checkout(
    repo: Repo,
    accessToken: string | undefined,
    ref: string | undefined,
  ): Promise<GitCheckout> {
    this.checkoutCalls.push({ repo, accessToken, ref });
    if (this.error) throw this.error;
    return {
      repoRoot: this.repoRoot,
      cleanup: async () => {
        this.cleanupCalls += 1;
      },
    };
  }
}
