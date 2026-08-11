# ADR-0051: Reject a repo's `localPath` if it looks like a home directory

## Status

Accepted

## Context

A team member's "Generate unit tests" run failed with:

> jest ran but found no tests among the generated files — check the
> target project's Jest config (testMatch/testPathIgnorePatterns)
> actually includes `*.generated.test.*` files.

The real cause had nothing to do with Jest config. The repo's
`localPath` was registered as `C:\Users\pvpl1` — the developer's entire
Windows home directory — with `targetPath: "cod"` naming a subfolder
inside it. `ensureJestAvailable` (`packages/unit-test-engine`) happily
ran `npm install --save-dev jest` straight into that home directory
(creating a stray `package.json`/`node_modules` there, since none
existed), 15 files under `cod/` got discovered and sent to Gemini, and
the generated tests failed for the same reason ADR-0048 fixed — but the
misconfigured `localPath` itself never surfaced as the problem. The
failure that eventually appeared, 24 minutes into a run, gave no hint
the real issue was the registered path.

There's no legitimate reason to register an entire home directory as a
project's `localPath` — every real project is a specific folder that
directly contains its own `package.json`, never "the folder that
contains all of a developer's folders."

## Decision

`CreateRepoUseCase` now rejects repo creation outright when `localPath`
looks like a bare home directory: `C:\Users\<name>` (Windows),
`/home/<name>` (Linux), or `/Users/<name>` (macOS) — matched exactly,
so a real project nested underneath (`C:\Users\pvpl1\cod`) is
unaffected. `looksLikeHomeDirectory()`/`HomeDirectoryLocalPathError`
live in a new, dependency-free `local-path-validation.ts` so the check
is independently unit-testable.

`RepoController` catches this and returns `400 Bad Request` with the
error's own message rather than letting it surface as an unhandled 500. **Also fixed while wiring this up**: `DashboardPage`'s "Add repo"
form had never actually displayed a `createRepo` failure — the
`catch` block silently returned with a comment saying it'd be
"surfaced via `createRepo.isError`, if the UI grows one." It never had.
Added the same `ApiError`-message display pattern already used on
`LoginPage`/`SignupPage`, so this (and any future repo-creation
validation) is actually visible where it happens, not just present in
a network response nobody sees.

## Consequences

- Fails at repo-creation time, immediately and with a specific,
  actionable message — not 24 minutes into a run with a misleading
  Jest-config error pointing nowhere near the real problem.
- Scoped to the exact bare-home-directory pattern; anything nested
  under it is a normal, valid `localPath`.
- No validation added for GitHub/GitLab repos (`remoteUrl`) — this
  class of mistake is specific to a locally-browsed folder path, which
  a git URL can't accidentally be.
- The web fixture (`local-api-server.ts`) duplicates the same regex
  rather than importing `@cqp/application`, consistent with that file's
  existing "don't depend on the backend application layer" design.
