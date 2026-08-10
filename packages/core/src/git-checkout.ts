import type { Repo } from './repo.js';

export interface GitCheckout {
  repoRoot: string;
  /** Removes whatever was materialized on disk — always call in a `finally`, even on failure. */
  cleanup(): Promise<void>;
}

/**
 * Port for materializing a `github`/`gitlab` repo onto local disk before a
 * scan/unit-test/coverage run can read it (docs/adr/0047) — mirrors
 * `EmailSender`/`StagingTestRunner`'s port/adapter split: this package only
 * knows the shape of the result, not how the clone actually happens
 * (subprocess, temp dir — all adapter concerns, see @cqp/git-checkout).
 * Never handed a raw access token — `ensureLocalCheckout` decrypts
 * `Repo.encryptedAccessToken` immediately before calling this, so only the
 * adapter ever sees the plaintext, for exactly as long as the clone takes.
 */
export interface GitCheckoutProvider {
  checkout(
    repo: Repo,
    accessToken: string | undefined,
    ref: string | undefined,
  ): Promise<GitCheckout>;
}
