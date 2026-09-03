import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GitCheckout, GitCheckoutProvider, Repo } from '@cqp/core';
import { redactUrlCredentials, runSubprocess, SubprocessTimeoutError } from '@cqp/plugin-shared';

/**
 * Live-confirmed necessary: a clone with an invalid/expired token can hang
 * well past 15s even with `GIT_TERMINAL_PROMPT=0` set (GitHub's own
 * auth-challenge retry behavior, not a local interactive prompt) — the
 * exact same class of problem `runSubprocess`'s `timeoutMs` was built for
 * (docs/adr/0045). 5 minutes is comfortably above any real shallow clone,
 * while still guaranteeing a bad token can never hang a run indefinitely.
 */
const CLONE_TIMEOUT_MS = 5 * 60 * 1000;

export interface GitCloneCheckoutProviderOptions {
  gitCommand?: string;
}

/**
 * A successful clone never echoes this URL, but git's own FATAL
 * auth-failure message does embed it, credential included — confirmed
 * live for PytestStagingTestRunner.cloneUrl()'s exact same pattern
 * (2026-09-03), where a bad token's raw value reached Railway's logs and
 * a crash-alert email before the checkout() catch block below started
 * redacting it. GitHub and GitLab embed a token differently: GitHub
 * accepts the token as the URL username with no password, but GitLab
 * does not — a bare token-as-username leaves the request looking
 * unauthenticated, so GitLab challenges for real credentials, which
 * fails outright with `GIT_TERMINAL_PROMPT=0` set (live-confirmed:
 * "terminal prompts disabled" → exit code 128). GitLab's own documented
 * convention is a placeholder username (`oauth2`) with the token as the
 * password.
 */
export function cloneUrl(
  repo: Pick<Repo, 'provider' | 'remoteUrl'>,
  accessToken: string | undefined,
): string {
  if (!accessToken) return repo.remoteUrl ?? '';
  const url = new URL(repo.remoteUrl ?? '');
  if (repo.provider === 'gitlab') {
    url.username = 'oauth2';
    url.password = accessToken;
  } else {
    url.username = accessToken;
  }
  return url.toString();
}

/**
 * Real adapter for `GitCheckoutProvider` (docs/adr/0047) — shells out to a
 * real `git clone` via the existing `runSubprocess` helper, mirroring
 * `PytestStagingTestRunner`'s exact pattern (mkdtemp -> shallow clone ->
 * caller cleans up). Always a fresh clone, never cached, matching that
 * same precedent — simplest-correct over premature reuse-across-runs
 * complexity.
 */
export class GitCloneCheckoutProvider implements GitCheckoutProvider {
  constructor(private readonly options: GitCloneCheckoutProviderOptions = {}) {}

  async checkout(
    repo: Repo,
    accessToken: string | undefined,
    ref: string | undefined,
  ): Promise<GitCheckout> {
    if (!repo.remoteUrl) {
      throw new Error(`Repo ${repo.id} has no remoteUrl to clone (provider=${repo.provider}).`);
    }
    const workDir = await mkdtemp(path.join(tmpdir(), 'cqp-repo-checkout-'));
    const repoDir = path.join(workDir, 'repo');
    const git = this.options.gitCommand ?? 'git';

    const args = ['clone', '--depth', '1'];
    if (ref) args.push('--branch', ref);
    args.push(cloneUrl(repo, accessToken), repoDir);

    try {
      const result = await runSubprocess(git, args, {
        cwd: workDir,
        envVarName: 'REPO_CHECKOUT_GIT_PATH',
        // Forces a fast, explicit failure instead of blocking on a
        // credential prompt this non-interactive process could never answer.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeoutMs: CLONE_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `git clone exited with code ${result.exitCode}.\nstderr: ${redactUrlCredentials(result.stderr.trim())}`,
        );
      }
    } catch (error) {
      await rm(workDir, { recursive: true, force: true });
      if (error instanceof SubprocessTimeoutError) {
        throw new Error(
          `git clone of repo ${repo.id} did not finish within ${CLONE_TIMEOUT_MS / 1000}s and was killed — check the remote URL and access token.`,
        );
      }
      throw error;
    }

    return {
      repoRoot: repoDir,
      cleanup: () => rm(workDir, { recursive: true, force: true }),
    };
  }
}
