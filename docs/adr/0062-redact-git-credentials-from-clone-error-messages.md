# ADR-0062: Redact embedded git credentials from clone error messages

## Status

Accepted

## Context

Staging QA automation started failing every run on 2026-09-02, ~18:30
UTC onward: `git clone exited with code 128`, with git's own fatal
message —
`could not read Password for 'https://ghp_Cxbz...@github.com': No such
device or address` — meaning `STAGING_TESTS_GIT_TOKEN` had gone invalid
(expired or revoked; the last successful run finished ~09:25 UTC the
same day, so somewhere in that ~9-hour window).

Diagnosing it surfaced a second, more serious problem. Both
`PytestStagingTestRunner.cloneUrl()` (`packages/staging-test-runner`)
and `GitCloneCheckoutProvider.cloneUrl()` (`packages/git-checkout`, used
for every customer repo clone across scans/coverage/unit-test
generation) carried the same doc-comment claim: _"never logged/thrown
anywhere — git's own clone progress output doesn't echo the source URL,
so the token never appears in stdout/stderr either."_ That's true for a
successful clone's progress output, but false for git's own FATAL
auth-failure message, which embeds the full URL — credential included.
`requireZeroExit`/`GitCloneCheckoutProvider.checkout()` both throw an
`Error` built directly from that raw `stderr`, and that message then
flows into:

- Railway's persistent logs (confirmed live, twice)
- The staging run's crash-alert email body
  (`RunStagingTestSuiteUseCase`: `` `The run crashed before any test
could complete: ${(error as Error).message}` ``) — the token reached
  a real inbox

The assumption held for as long as the token stayed valid, and broke
exactly when it stopped being valid — the one moment it mattered most.
The exposed token (`ghp_CxbzM...`) must be treated as compromised
regardless of this fix and rotated on GitHub.

## Decision

New shared utility, `redactUrlCredentials` in `@cqp/plugin-shared`
(`packages/plugins/shared/src/redact-url-credentials.ts`):
strips the `user[:pass]@` userinfo component from any `scheme://...` URL
in a string, generic enough to cover GitHub's token-as-username form,
GitLab's `oauth2:token` form, and any other host/scheme this platform
is ever pointed at.

Applied at every point either package throws an `Error` built from raw
subprocess stderr/stdout:

- `PytestStagingTestRunner`'s `requireZeroExit` (clone/install steps)
  and the pytest-report-missing fallback error.
- `GitCloneCheckoutProvider.checkout()`'s clone-exit-code check.

Both packages' outdated `cloneUrl()` doc comments were corrected to
describe the real behavior (redacted-on-failure, not never-appears) and
point to this fix.

## Consequences

- Any future invalid/revoked git token now produces a clean, safe error
  (`https://***REDACTED***@github.com`) in logs, alert emails, and
  anywhere else these Errors surface — no code change needed per call
  site going forward, since the redaction lives in the one place both
  packages already throw from.
- Purely defensive — does not fix the root cause of any given clone
  failure (an invalid token still fails the run the same way); it only
  ensures the failure can't also leak a credential.
- Does not retroactively scrub the token that already leaked (Railway's
  log history, the sent alert email) — that value must be rotated on
  GitHub independently of this fix.
