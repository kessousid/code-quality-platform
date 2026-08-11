# ADR-0047: Two execution modes for scans/unit-tests/coverage — local worker vs. Railway-hosted GitHub clone

## Status

Accepted

## Context

Every scan, unit-test generation run, and coverage gate required a `Repo`
with `provider: 'local'` and a `localPath` that already existed on
whichever machine's `apps/worker` happened to pick up the job — routed
there via the existing per-repo `workerId` (ADR-0031). This works well
when a developer runs their own worker on their laptop (the documented,
supported path — see `docs/user-guide.md`), but there was no way to
analyze a repo that only exists on GitHub without first cloning it
locally and standing up a worker for it. `RepoProvider` already had
`'github'`/`'gitlab'` as enum values (ADR-0003 deferred them), but every
run use case explicitly rejected anything other than `'local'`.

The request was for two clearly-separated paths:

1. **Local folder** — code on the user's own machine, run via a worker
   they run themselves. Already fully built (ADR-0031's `workerId`
   routing covers scan/unit-test/coverage identically, not just the
   folder-browse feature from ADR-0032) — this ADR changes nothing about
   it beyond UI framing.
2. **GitHub repo** — the user pastes a repo URL (+ optional PAT for a
   private repo). Railway's own worker clones it fresh and runs the
   analysis there. Railway becomes the dashboard/orchestrator, never the
   holder of anyone's code long-term, and the user never uploads
   anything or runs a worker themselves for this path.

Railway already runs its own `apps/worker` instance (no `WORKER_ID`
override in its Dockerfile → answers to `'default'`) — before this
change it was effectively dead weight, since any repo left pointed at it
would fail immediately (no local checkout exists in that container).
This gives it a real job.

Two existing credential-storage precedents were checked and rejected as
the wrong shape for a PAT that must be decrypted server-side to actually
clone: the Gemini API key override (ADR-0037, client-side `localStorage`
only, never persisted server-side) and `ApiToken` (one-way SHA-256 hash,
never retrievable). A PAT needs genuine encrypt-at-rest, decryptable
only by the process that clones.

A live test confirmed `git clone` with a bad/expired token can hang well
past 15 seconds even with `GIT_TERMINAL_PROMPT=0` set (GitHub's own
auth-challenge retry behavior, not a local interactive prompt this
process could otherwise answer) — the same class of problem the staging
pytest hang (ADR-0045) was built to survive.

## Decision

**Core** (`packages/core`): `Repo` gains `encryptedAccessToken?: string`
(opaque ciphertext, never decrypted at this layer). `CreateRepoInput`
only ever carries `encryptedAccessToken` — never a plaintext token, same
discipline as `CreateUserInput.passwordHash` never carrying a raw
password. A new `GitCheckoutProvider` port
(`checkout(repo, accessToken, ref): Promise<GitCheckout>`, where
`GitCheckout` is `{ repoRoot, cleanup() }`) is the one seam all three run
use cases share.

**New package `packages/git-checkout`**: `GitCloneCheckoutProvider`
shells out to a real `git clone --depth 1` via the existing
`runSubprocess` helper (same `mkdtemp` → shallow clone → caller-cleans-up
shape as `PytestStagingTestRunner`). Always a fresh clone, never cached
or reused across runs — the same simplest-correct choice already made
for the staging runner, not solved with a shared-checkout-lifecycle
layer. The token is embedded as the clone URL's username (never logged,
mirroring `PytestStagingTestRunner.cloneUrl()`). Sets
`GIT_TERMINAL_PROMPT=0` _and_ a 5-minute `timeoutMs` (reusing
`SubprocessTimeoutError`, ADR-0045) as defense in depth — the env var
alone was empirically proven insufficient.

**Application** (`packages/application`):

- `repo-token-cipher.ts` — AES-256-GCM `encryptRepoToken`/
  `decryptRepoToken`, format `iv.authTag.ciphertext` (base64, dot-joined).
  `key: Buffer` is an explicit parameter, not read from `process.env`
  inside these functions, keeping them pure and trivially unit-testable.
  `parseRepoTokenEncryptionKey(base64Key)` validates exactly 32 bytes and
  is called once at each composition root (`apps/api`, `apps/worker`)
  from the real `REPO_TOKEN_ENCRYPTION_KEY` env var.
- `ensureLocalCheckout(repo, ref, checkoutProvider, repoTokenDecryptionKey)`
  — for `provider: 'local'`, today's exact existing-`localPath` guard,
  just relocated (same error/message), with a no-op `cleanup`. For
  `github`/`gitlab`, decrypts the token if present and delegates to the
  checkout provider.
- `RunScanUseCase`, `RunUnitTestGenerationUseCase`, `RunCoverageGateUseCase`
  each gain `checkoutProvider: GitCheckoutProvider` and
  `repoTokenDecryptionKey: Buffer` constructor params, and each replaces
  its old inline guard with
  `const { repoRoot, cleanup } = await ensureLocalCheckout(...)` wrapped
  in a `try { ...engine call using repoRoot... } finally { await cleanup(); }`.
  Zero changes to the engines themselves (`runScan`/`runUnitTestGeneration`/
  `runCoverageGate`) — they only ever see a `repoRoot` string, exactly as
  before.
- `CreateRepoUseCase` takes a `repoTokenEncryptionKey: Buffer` and encrypts
  `accessToken` (its own application-layer-only input field) before ever
  constructing a `CreateRepoInput` — the raw token never reaches
  `packages/db`. `resolveWorkerId()` forces `workerId: 'default'` for any
  `github`/`gitlab` repo, ignoring a client-supplied value — that's the
  one worker instance Railway itself always runs, the only one capable of
  doing the cloning. A `'local'` repo keeps whatever `workerId` was
  requested, unchanged from today.
- New `UpdateRepoAccessTokenUseCase(orgId, repoId, accessToken: string | null)`
  rotates or clears a token after creation without recreating the repo;
  looks the repo up first and throws `RepoNotFoundError` for a 404,
  consistent with every other repo-scoped use case.

**DB**: migration adds `Repo.encryptedAccessToken TEXT NULL`;
`PrismaRepoRepository` passes it through as an opaque column, plus the
new `updateAccessToken()` method (fetch-then-update, matching the
repository's other update methods).

**API** (`apps/api`): `POST /repos` accepts an optional `accessToken`;
new `PUT /repos/:id/access-token` (body `{ accessToken: string | null }`,
`null` clears). Every repo response (create/get/list/the new endpoint)
strips `encryptedAccessToken` before serialization — ciphertext has no
reason to ever be on the wire. `RepoModule` reads
`REPO_TOKEN_ENCRYPTION_KEY` once at bootstrap (fail loudly at startup,
same `requireEnv` precedent as `ALERT_EMAIL_FROM`/`APP_PASSWORD`,
ADR-0041), not lazily on first use.

**Worker** (`apps/worker`): `main.ts` constructs one
`GitCloneCheckoutProvider` and one decryption `Buffer` (same
fail-loudly-at-boot `REPO_TOKEN_ENCRYPTION_KEY` requirement) and threads
both into all three use cases via `queue.ts` and the three job files.
This applies to **every** worker instance, including a developer's own
laptop worker — a `'local'` repo never actually exercises either value,
but requiring the env var everywhere avoids a worker that silently only
half-works depending on which repos happen to reach it.

**Web** (`apps/web`): the "Add repo" form on `DashboardPage` gains a
"Where does this code live?" radio choice — _On my computer_ is today's
exact folder-browse + Worker ID UX, unchanged; _On GitHub_ replaces it
with a repo URL field and an optional password-style PAT field, with no
folder browser or Worker ID control (it's set automatically).
`RepoDetailPage` gains an "Update access token" action, shown only for a
`github`/`gitlab`-provider repo, that rotates or clears the token via the
new endpoint — the token is never fetched back from the API, only ever
written.

## Consequences

- A single `REPO_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) must be
  identical across `apps/api` and every `apps/worker` instance that might
  ever touch a github/gitlab repo — encryption happens in `apps/api`,
  decryption happens wherever the job lands (always `workerId: 'default'`
  today, but the key still needs to be the literal same value anywhere
  the ciphertext could be read). Set on Railway's `api` and `worker`
  services; also added to the local `.env`/`.env.railway-worker` files
  used for local development against Railway's shared Postgres/Redis, so
  local dev and every developer's own worker keep booting.
- Every worker (including a developer's own laptop instance) now hard-
  requires `REPO_TOKEN_ENCRYPTION_KEY` at boot, even though a `'local'`
  repo never uses it — accepted in favor of "fails loudly and
  identically everywhere" over "fails invisibly the first time a
  github repo happens to reach a worker that was never configured for
  it."
- No caching or reuse of a clone across separate runs — a scan, then a
  unit-test-generation run, then a coverage run against the same repo
  each independently fresh-clone. Matches the existing staging-runner
  precedent; can be revisited if clone time becomes a real bottleneck.
- No GitHub OAuth or repo-picker UI — a pasted URL + PAT is the whole v1
  flow.
- **Update**: GitLab support followed with no backend changes at all —
  the team started using it, and `GIT_HOSTED_PROVIDERS`, the API DTO's
  `@IsIn` validator, and `GitCloneCheckoutProvider` were already
  provider-agnostic. Only `DashboardPage`'s toggle needed a third
  option ("On GitLab" alongside "On my computer"/"On GitHub"), exactly
  as anticipated above.
- `apps/worker`'s Docker image only ever installed `openssl` (for
  Prisma) — a live scan against a real public repo failed immediately
  with `ToolNotFoundError: git not found` until `git` was added
  alongside it. Caught during this ADR's own deployment verification,
  not in advance; fixed in the same rollout.
- This platform still never _pushes_ anything — the clone is read-only,
  torn down after each run, exactly like the staging test runner's own
  checkout.
