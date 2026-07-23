# Code Quality & Security Assessment Platform

An orchestration layer over best-of-breed static analysis engines
(Semgrep, ESLint, jscpd, gitleaks, OSV-Scanner, madge), built to
correlate findings across files, explain them in plain language, estimate
business impact, and generate reports a security team or an engineering
manager can act on directly — all via deterministic, rule-based
automation (see ADR-0020), with **zero LLM calls in the scan pipeline
itself**. A second module, Unit Testing, primarily runs a **zero-LLM
coverage gate** (ADR-0025): it diffs a repo's working tree against a
base branch, runs the repo's own existing, developer-written Jest suite
with real coverage collection, and fails if any changed line lacks
coverage or any test is failing — ensuring developers actually test
their own code, checked before merging. That same module can also
generate and run real Jest unit tests via Google's Gemini API as a
secondary, optional flow (ADR-0024) — the one deliberate, scoped
exception to the no-LLM stance, since generating a test and verifying a
developer wrote their own are different capabilities.

Initial target stack: JavaScript, TypeScript, React, Next.js, Node.js,
Express, HTML/CSS, Docker, YAML, GitHub Actions, GitLab CI — additional
languages/frameworks are added as plugins.

## Status

All 10 planned phases are implemented and verified, plus several
follow-up passes: worker wiring (create a repo → scan it → see real
findings end to end), one-click email-based sign-in for `@curatal.com`,
real scan cancellation/live progress/category selection/a filesystem
target picker, LLM-generated Jest unit tests with real execution and
reporting, and a zero-LLM coverage gate that checks developers tested
their own changed lines before merging. See:

- `docs/user-guide.md` — practical day-to-day usage guide for developers (start here if you just want to use it)
- `docs/architecture/00-overview.md` — system context, containers, scan lifecycle
- `docs/adr/` — architecture decision records (0001–0028)
- `BACKLOG.md` — phase-by-phase backlog with what was actually verified

## Quick start

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

This machine's actual working setup is a native local Postgres (not
Docker — see `docs/architecture/dev-database.md`) plus a free
[Upstash](https://upstash.com) Redis instance; `start.ps1` loads
`DATABASE_URL`/`REDIS_URL`/`GEMINI_API_KEY` from a gitignored root
`.env` and starts the API/worker/web dev servers. Sign in with any
**@curatal.com** email — no token, no password yet (interim, see
ADR-0022: "we will build the authentication later").

<details>
<summary>Manual steps (what the script above does)</summary>

```sh
# .env at repo root: DATABASE_URL, REDIS_URL, GEMINI_API_KEY (all gitignored)
pnpm --filter @cqp/db run generate
pnpm --filter @cqp/db run migrate:deploy

pnpm --filter @cqp/api run dev        # http://localhost:3000 (Swagger at /docs)
pnpm --filter @cqp/worker run dev     # consumes the scans + unit-tests + coverage-runs queues
pnpm --filter @cqp/web run dev        # http://localhost:5173 (or the next free port)
```

An operator-only token flow (`node apps/api/dist/scripts/bootstrap-org.js`

- `POST /auth/session`) still exists for CI/API clients per ADR-0016 — the
  browser just doesn't need it anymore.

</details>

Create a repo with a real **local checkout path** (`localPath`) on the
machine running the worker — there's no clone-from-remote yet (ADR-0003),
so scanning a `github`/`gitlab` repo without one will fail clearly. Use
the folder browser rather than a parent directory containing many
projects (a `C:\parent` containing 25 unrelated repos will scan all of
them). Then start a scan — cancel it, watch live progress, or pick which
categories (security/code-quality/secrets/dependencies/architecture) to
run — and the worker persists real findings.

The **"Unit Testing"** tab's primary section, **Coverage gate**, needs
no setup and no API key: point it at a repo (optionally a base branch,
defaulting to the repo's default branch) and it diffs your working tree
against that branch, runs the repo's own existing Jest suite with real
coverage collection, and reports a pass/fail verdict plus which changed
lines lack coverage. If the target repo has no Jest install of its own
yet, one is installed automatically (`jest`, plus a babel TypeScript
preset + a generated `babel.config.cjs` for `.ts`/`.tsx` targets with no
transform configured) — zero manual setup, by design.

The secondary, collapsed **"Generate unit tests"** section picks a
file/folder/function and writes+runs a real Jest test for it (same
zero-setup Jest auto-install as the coverage gate above). It offers a
choice of generator, per request (ADR-0026): **Gemini** (AI-written —
needs a free `GEMINI_API_KEY` from aistudio.google.com/apikey in
`.env`) or **script-based** (deterministic, zero-LLM — actually calls
the real function once with a synthesized argument and asserts exactly
what it really returned, a golden-master test; no API key needed, but
it can't judge whether the captured behavior is _correct_, only that
it's real). The coverage gate's own inline "Generate tests" button
stays fixed to Gemini specifically.

For gitleaks/OSV-Scanner, set `CQP_GITLEAKS_PATH`/`CQP_OSV_SCANNER_PATH`
per `docs/architecture/local-tool-setup.md`; Semgrep/ESLint/jscpd/madge
resolve automatically if installed.

**Security note:** email sign-in has no password or verification yet —
anyone who knows a `curatal.com` address can act as that person, and
every `@curatal.com` login shares one workspace's data (ADR-0022). Do not
expose this build to anything beyond a trusted local/internal network
until that's replaced with real authentication.

## Development process

Built iteratively, one phase at a time (architecture → folder structure
→ tech choices → DB schema → service architecture → API design →
scanning engine → AI/automated-analysis engine → reporting engine →
frontend dashboard), each with production-quality code and tests before
moving on — see `docs/adr/` for the reasoning behind every non-obvious
decision, including several supersessions/extensions: ADR-0020
(replacing ADR-0013's LLM-provider design), ADR-0021 (closing the
worker-wiring gap every earlier phase deliberately deferred), ADR-0022
(email-based sign-in, extending ADR-0014), ADR-0023 (real scan cancel/
progress/categories/target picker), ADR-0024 (the one deliberate,
scoped exception to ADR-0020's no-LLM stance, for unit-test generation),
ADR-0025 (a zero-LLM coverage gate — squarely back inside ADR-0020's
default — that became the Unit Testing module's primary flow once its
real goal turned out to be "did the developer test their own code,"
not "write tests for them"), and ADR-0026 (a second, deterministic test
generator alongside Gemini, selectable per request, plus the plug-in
architecture so a future LLM provider is an addition, not a redesign).
