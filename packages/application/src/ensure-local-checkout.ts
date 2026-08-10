import type { GitCheckoutProvider, Repo } from '@cqp/core';
import { decryptRepoToken } from './repo-token-cipher.js';

export interface LocalCheckout {
  repoRoot: string;
  /** No-op for a `'local'` repo (nothing was materialized); a real cleanup for a fresh clone. Always call in a `finally`. */
  cleanup: () => Promise<void>;
}

const NO_OP_CLEANUP = async (): Promise<void> => {};

/**
 * Shared by `RunScanUseCase`, `RunUnitTestGenerationUseCase`, and
 * `RunCoverageGateUseCase` (docs/adr/0047) — the exact seam all three
 * already had in common (fetch `Repo`, guard on how to reach its code,
 * hand a bare `repoRoot: string` to an engine function that doesn't care
 * how the path came to exist). For `provider: 'local'` this is today's
 * exact guard, just relocated — same error, same message. For
 * `provider: 'github'`/`'gitlab'` it decrypts the token (if any) and
 * delegates to a real clone.
 */
export async function ensureLocalCheckout(
  repo: Repo,
  ref: string | undefined,
  checkoutProvider: GitCheckoutProvider,
  decryptionKey: Buffer,
): Promise<LocalCheckout> {
  if (repo.provider === 'local') {
    if (repo.localPath === undefined) {
      throw new Error(
        `Repo ${repo.id} has no local checkout to scan (provider=${repo.provider}, localPath=unset)`,
      );
    }
    return { repoRoot: repo.localPath, cleanup: NO_OP_CLEANUP };
  }

  const accessToken =
    repo.encryptedAccessToken !== undefined
      ? decryptRepoToken(repo.encryptedAccessToken, decryptionKey)
      : undefined;
  const checkout = await checkoutProvider.checkout(repo, accessToken, ref);
  return { repoRoot: checkout.repoRoot, cleanup: checkout.cleanup };
}
