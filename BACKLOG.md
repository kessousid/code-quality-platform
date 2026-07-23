# Backlog

Epics map 1:1 to the phase sequence agreed with the user. Each epic is not
started until the previous one's sign-off criteria are met. See
`docs/architecture/00-overview.md` for the architecture this backlog
implements, and `docs/adr/` for decisions that shaped scope.

## MVP analyzer priority (within Phase 7+)

Ordered by signal, based on this platform's own reason for existing (the
gap between raw Semgrep output and a real manual pentest on CuratalIT):

1. **Security** (OWASP Top 10 / API Top 10 via Semgrep + custom correlation)
2. **Secret detection** (gitleaks)
3. **Dependency vulnerabilities** (OSV-Scanner, npm audit)
4. **Code quality** (ESLint/typescript-eslint, jscpd, complexity, dead code)
5. Architecture review (module graph, layering violations)
6. Performance analysis
7. Database review
8. DevOps/IaC review
9. Test coverage
10. Documentation quality
11. Best practices / technical debt scoring (cross-cutting, feeds off all of the above rather than being its own scan pass)

## Epics

### Epic 1 — Architecture & Planning (Phase 1) — DONE

- [x] High-level architecture doc (context, container, sequence diagrams)
- [x] ADR-0001 orchestrate existing engines
- [x] ADR-0002 TypeScript monorepo
- [x] ADR-0003 defer multi-tenancy / live VCS integration
- [x] ADR-0004 human-in-the-loop for AI patches/PRs
- [x] User sign-off on MVP module priority and non-goals

### Epic 2 — Folder structure (Phase 2) — DONE

- [x] Monorepo scaffold: pnpm workspaces + Turborepo config
- [x] `packages/core` skeleton (Finding schema, plugin interface types only)
- [x] `packages/plugins/*` skeletons (one per MVP analyzer: semgrep, gitleaks,
      osv-scanner, eslint, jscpd, dependency-graph)
- [x] `apps/api`, `apps/worker`, `apps/web` skeletons
- [x] Root tooling: TS config base, ESLint flat config, Prettier, husky pre-commit
- [x] Verified: `pnpm install`, `pnpm -r run typecheck`, `pnpm exec eslint .`,
      and `pnpm -r run build` all pass clean across all 13 packages

### Epic 3 — Technology choices (Phase 3) — DONE

- [x] ADR-0005: API framework — NestJS on Express adapter (DI maps to Clean
      Architecture layers; business logic stays framework-agnostic)
- [x] ADR-0006: Job queue — BullMQ + Redis (pg-boss and Temporal considered
      and rejected for MVP — see ADR for why)
- [x] ADR-0007: ORM — Prisma, with a hard ESLint-enforced ban on
      `$queryRawUnsafe`/`$executeRawUnsafe` (Drizzle considered and rejected
      for now — see ADR for the revisit trigger)
- [x] ADR-0008: Frontend stack — React Router, TanStack Query, Tailwind +
      shadcn-style primitives, React Flow (dependency graph), Recharts (trends)
- [x] Working proof for each choice, not just paper decisions:
  - NestJS: real HTTP server bootstrapped and hit live — `GET /health` and
    `/docs-json` (Swagger) both verified with curl
  - BullMQ+Redis: queue/worker wiring compiles against real types; job logic
    unit tested as a pure function (no live Redis in this sandbox — flagged
    as unverified; `docker-compose.yml` added for local Postgres+Redis)
  - Prisma: unchanged from Phase 2 scaffold, guardrail rule added and
    confirmed to lint-fail on a `$queryRawUnsafe` call pattern
  - Frontend: Tailwind v4 + React Flow + Recharts + Router + Query all
    render together in one page, component-tested with Testing Library,
    production `vite build` and `vite preview` both verified
- [x] Fixed real issues found while verifying (not just written, run):
      NestJS/Vitest decorator-metadata gap (needed SWC transform),
      `@nestjs/swagger` v8→v11 peer-dependency mismatch, jsdom missing
      `ResizeObserver`, and `vitest run` failing on packages with no tests
      yet (added `--passWithNoTests` repo-wide)

### Epic 4 — Database schema (Phase 4) — DONE

- [x] ADR-0009: Finding is a persistent entity deduped by `fingerprint`
      across scans (not a per-scan row) — clarifies the ambiguity left in
      Phase 2's `Finding` TS type; `FindingHistory` is the per-scan snapshot
- [x] Core entities: Org, User, Repo, Scan, Finding, FindingHistory, Patch,
      Report — plus the normalization children Phase 2's `Finding` type
      required: FindingLocation, FindingReference, AiFindingEnrichment,
      FindingCorrelation
- [x] `orgId` denormalized on every tenant-scoped table (per ADR-0003)
- [x] IDs are `cuid()` (non-enumerable) — a deliberate default for a
      security product, not just a style choice
- [x] Dependency graph deliberately NOT modeled as Postgres rows —
      `Scan.dependencyGraphStorageKey` points to an object-storage blob
- [x] Prisma enums kept out of `packages/core`; `packages/db` exports
      mapper functions (`severityToDb`/`FromDb`, etc.), each round-trip unit
      tested (4 tests, all enum value spaces covered)
- [x] Schema documented with an ERD (`docs/architecture/erd.md`)
- [x] Verified: `prisma validate` passes, `prisma generate` produces a
      client `@cqp/db` actually builds and typechecks against, initial
      migration SQL generated offline and committed
      (`packages/db/prisma/migrations/20260717052138_init/`)
- [x] Re-verified the Phase 3 ESLint guardrail against the real Prisma
      client surface: wrote a throwaway `$queryRawUnsafe` call, confirmed
      ESLint fails it, then deleted the file
- [x] **Closed 2026-07-17**: migrations applied against a real live
      PostgreSQL 18 server (a dedicated clone, isolated `cqp` schema — see
      `docs/architecture/dev-database.md`), not Docker in this sandbox.
      BullMQ's live Redis connection (Phase 3) remains a separate,
      still-open gap.

### Epic 5 — Service architecture (Phase 5) — DONE

- [x] ADR-0010: Clean Architecture layering, proven with a real vertical
      slice (create/get scan) through all four layers: `packages/core`
      (domain type + `ScanRepository` port), `packages/application`
      (`CreateScanUseCase`/`GetScanUseCase`, framework-free), `packages/db`
      (`PrismaScanRepository` adapter), `apps/api` (`ScanModule`/
      `ScanController`, the only layer touching `@nestjs/*`)
- [x] ADR-0011: Plugin runtime (`packages/plugin-runtime`) — generic
      worker-thread isolation + enforced timeouts, deliberately decoupled
      from `AnalyzerPlugin`/`Finding` so Phase 7 wires real plugins through
      it. All 3 paths (success, thrown error, hang/timeout) exercised with
      **real worker threads**, no mocking
- [x] ADR-0012: Correlation engine scope — `packages/correlation` computes
      a deterministic, line-number-independent `fingerprint` now (6 tests);
      graph-based cross-file correlation stays Phase 8's job
- [x] ADR-0013: AI engine contracts — `AiEnrichmentService` (structured
      prompt → parsed `AiEnrichment`, fails closed on malformed JSON) and
      `selectFindingsForEnrichment` (hard pre-call cost guard) in
      `packages/ai`, tested against a fake `LlmProvider` (9 tests); no real
      Claude API calls made — that's explicitly Phase 8's job, not silently
      done here.
      **Superseded in Phase 8 (ADR-0020): the user opted out of LLM API
      cost entirely. `packages/ai` was deleted; see Epic 8 below.**
- [x] Verified: full monorepo (17 packages) typechecks, builds, lints
      clean, and passes all tests (35 total)
- [x] Live-verified the vertical slice twice: booted the real API, hit
      `POST /scans` and `GET /scans/:orgId/:id`, confirmed request reaches
      all the way to `PrismaScanRepository` and fails only at the expected
      point (no live Postgres in this sandbox)
- [x] **Found and fixed two real bugs by actually running things**, not
      just typechecking:
  1. `exactOptionalPropertyTypes` rejected explicit `undefined` on optional
     properties in three places (`InMemoryScanRepository`,
     `AiEnrichmentService`, `PrismaScanRepository`) — fixed with
     conditional spreads instead of always-assign.
  2. **`apps/api`'s `tsx`-based `dev` script silently broke NestJS DI.**
     `tsx` (esbuild) doesn't emit `emitDecoratorMetadata`, the same gap
     flagged for Vitest in Phase 3 — but that fix (SWC) only covered tests,
     not the dev script. The API booted, mapped routes, and served
     `/health` fine; every controller with an injected dependency silently
     got `undefined`, surfacing only as a `TypeError` on first real
     request. Fixed by switching `dev` to `tsc -b --watch` +
     `node --watch dist/main.js` (same compiler as production); `tsx`
     removed from `apps/api` entirely. Documented as a postmortem in
     ADR-0005. This is exactly the kind of bug that never shows up from
     typechecking or from a unit test using manual `useValue` providers —
     only from actually booting the app and hitting it.
- [ ] **Still not verified**: `PrismaScanRepository` against a live
      PostgreSQL (same sandbox limitation as Phases 3–4).

### Epic 6 — API design (Phase 6) — DONE

- [x] ADR-0014: Auth model — `ApiToken` is the sole credential (schema
      addition: `ApiToken` model, migration generated offline and
      committed), `ApiTokenGuard` applied globally via `APP_GUARD`,
      `@Public()` for `/health` and `/auth/session`. Dashboard reuses the
      same token via an httpOnly cookie (`POST /auth/session`), not a
      separate password/session system — a deliberate scope decision, not
      an oversight (see ADR for why building full user identity wasn't
      done silently)
  - **This retires the gap Phase 5 flagged explicitly**: `orgId` no longer
    exists anywhere in a request body/query — every controller reads it
    from `@CurrentOrg()`, backed by the validated token. Verified live:
    `GET /repos` with no token → 401; with garbage token → reaches the
    (DB-backed) guard and fails there, never trusting client input.
  - **Also closed a second gap Phase 5 left open**: `CreateScanUseCase` now
    validates `repoId` against a real `RepoRepository` (existence + org
    ownership) before creating a scan — previously nothing stopped a scan
    against a nonexistent or cross-tenant `repoId`.
- [x] ADR-0015: Pagination/filtering — `PaginatedResult<T>` +
      `PaginationQueryDto` (offset-based, `page`/`pageSize`, max 100
      enforced not just documented), proven against `GET /findings` with
      real filters (`repoId`, `severity`, `status`, `category`), each
      validated against the same enums the domain defines
- [x] ADR-0016: CI/CD usage contract — documented in
      `docs/api/ci-usage.md` with a real polling-loop example; explicitly
      no bespoke webhook receiver (that stays deferred per ADR-0003)
- [x] OpenAPI spec covers repos, scans, findings, reports, and auth — live
      `/docs-json` inspected, confirmed bearer security scheme + all 10
      routes present
- [x] Full CRUD-ish surface added to prove the ADR-0010 pattern repeats
      cleanly: `RepoController` (create/list/get), `FindingController`
      (list with filter+pagination/get), `ReportController`
      (list-by-scan/get) — each with domain type, port, use case(s), Prisma
      adapter, controller, and tests, exactly like Phase 5's scan slice
- [x] Verified: 17 packages typecheck/build/lint clean; 60 tests pass
      total, including a real supertest-driven e2e suite
      (`app.e2e.spec.ts`) that boots the actual `AppModule` — real global
      guard, real `@Public()` wiring, real `ValidationPipe` — over real
      HTTP, not just isolated controller units
- [x] Live-verified against the real compiled server: `/health` 200
      without auth, `/repos` 401 with no token, all 10 routes mapped
      correctly, OpenAPI bearer scheme confirmed via `/docs-json`
- [x] Found and correctly explained (not silently worked around) one
      more consequence of the sandbox's no-live-DB gap: NestJS runs guards
      _before_ pipes, so a garbage-token request to `POST /scans` 500s at
      the (DB-backed) guard before `ValidationPipe` ever runs — the actual
      400 behavior is real and already proven by the e2e test using a
      _valid_ token against the in-memory fake, just not reproducible via
      live curl without a working Postgres
- [x] **Closed 2026-07-17**: `PrismaRepoRepository`, `PrismaScanRepository`,
      `PrismaApiTokenRepository`, and `ApiTokenGuard` all exercised against
      a real live PostgreSQL server end-to-end through the actual running
      API — `POST /repos` → `POST /scans` → `GET /scans/:id`, a real 404
      for a nonexistent `repoId`, and a real 401 for a garbage token (not
      the 500-because-no-DB this backlog previously documented). Rows
      independently verified via direct SQL, not just through the API.
      `PrismaFindingRepository`/`PrismaReportRepository` remain unverified
      live — nothing has written a `Finding` or `Report` row yet; that's
      Phase 7/9's job. See `docs/architecture/dev-database.md`.

### Epic 7 — Scanning engine (Phase 7) — DONE

- [x] `AnalyzerPlugin` interface + `Finding` schema (packages/core) — from
      Phase 2, extended here: `PluginContext` gained `orgId`/`repoId`
      (Phase 6 added them to `Finding` but nothing supplied them until now)
- [x] ADR-0017: external tool resolution (env var override → PATH → real
      error). Found and fixed a real bug while implementing it: Windows
      `spawn()` needs the exact `.exe` extension — a bare "semgrep" fails
      with ENOENT even though `semgrep.exe` is on PATH, because raw
      `CreateProcess` skips `cmd.exe`'s `PATHEXT` resolution. Fixed by
      appending `.exe` for the bare-fallback case, not by reaching for
      `shell: true` (real CVE history for Windows batch/cmd injection)
- [x] ADR-0018: scan orchestrator — glob-based dispatch (`shouldRunPlugin`),
      per-plugin failure isolation, real `git diff` for incremental mode
- [x] All 6 adapters implemented and verified against **real tools, real
      binaries, no mocking**:
  - Semgrep (`p/default` pinned ruleset, not `--config=auto` — auto
    requires telemetry on to pick rules, which this platform won't enable
    silently) — finds a real `eval()` vulnerability
  - gitleaks — finds a real (fake) Slack token, **redacts the secret
    value before it ever reaches a `Finding`** (a secret-detection tool
    echoing plaintext secrets into its own report is its own smell)
  - OSV-Scanner — finds real public advisories for pinned vulnerable
    `lodash`/`minimist` versions; maps by advisory _group_ (deduping
    GHSA/CVE aliases of the same issue), not raw vulnerability entries
  - ESLint — own fixed baseline ruleset applied to every scanned repo
    (never the target's own config); caught a real false-positive risk
    before it shipped: without explicit Node/browser globals, `no-undef`
    would flag ordinary `module`/`require`/`window` usage in any normal repo
  - jscpd — v5 turned out to be a Rust binary with a JS launcher, not a
    programmatic API (reality differed from the Phase 1 assumption);
    invoked via `node <launcher>`, sidestepping the Windows exe issue
    entirely since `process.execPath` is always correctly resolved
  - madge — finds a real circular `require()` between two fixture files
- [x] Full integration test: all 6 plugins dispatched through the real
      Phase 5 worker-thread isolation runtime against one fixture repo
      with a deliberate issue per category — genuinely exercises the
      whole Phase 5→7 chain together, not each piece in isolation
- [x] `computeChangedFiles` (git-diff incremental mode) tested against a
      real throwaway git repo with two real commits — not assumed to work
      just because `git` is a dependency
- [x] Verified: 19 packages typecheck/build/lint clean; full test suite
      passes (Semgrep/gitleaks/OSV-Scanner tests require
      `CQP_GITLEAKS_PATH`/`CQP_OSV_SCANNER_PATH` set locally — see
      `docs/architecture/local-tool-setup.md`)
- [ ] **Not done, deliberately (ADR-0018)**: wiring the orchestrator into
      `apps/worker`'s BullMQ consumer and persisting findings via
      `PrismaFindingRepository`. `scan-engine` takes a `ScanTarget` and
      returns findings in memory — the DB/queue integration is kept
      separate on purpose, so this phase's tests never needed Redis or a
      live Postgres to prove the engine itself works.

### Epic 8 — Automated analysis engine (Phase 8) — DONE

Redesigned mid-phase per an explicit user decision: no LLM API calls, no
AI cost — "automation" instead. See ADR-0020, which supersedes ADR-0013.
`packages/ai` (the `LlmProvider`/`AiEnrichmentService` design) was
**deleted outright**, not deprecated — no dead code left lying around for
a feature that doesn't exist. Replaced with `packages/enrichment`: pure,
deterministic, rule-based, zero network calls.

- [x] ~~LLM provider abstraction~~ — n/a by design; no provider exists
- [x] Cross-file correlation — added to `packages/correlation` (matches
      ADR-0012's own framing of this as correlation's deferred job, not a
      new package): `correlateByFile` relates findings sharing a location
      file path. Deterministic, no graph traversal, no AI (3 tests)
- [x] Explanation generation — `explainFinding` in `packages/enrichment`:
      a `${source}/${ruleId}`-keyed template table covering Phase 7's 6
      real plugins' known rules (semgrep eval-detected, gitleaks secrets,
      osv-scanner advisories, eslint no-undef/no-unused-vars, jscpd
      duplicate-code, dependency-graph circular-dependency), falling back
      to a category-level template that reframes the finding's own
      `rootCause`/`riskDescription` rather than inventing new claims (7 tests)
- [x] Business-impact estimation — `estimateBusinessImpact`: a real
      `category × severity` matrix producing business-language text.
      This is the genuinely new value over what a plugin already
      outputs (plugins speak in rule-id/CWE terms, not "what does this
      cost the business") — covers all 12 categories (14 tests)
- [x] Patch drafting — **deliberately not implemented.** A real patch
      needs to read the flagged file's actual content; this engine only
      ever sees `Finding` metadata. Faking a diff (or promoting
      `recommendedFix`'s prose as if it were one) would violate
      ADR-0004's human-in-the-loop model by putting something
      diff-shaped in front of a user who might trust it as a real patch.
      `AiEnrichment.suggestedPatch`/`patchConfidence` stay unset;
      documented in ADR-0020, not silently absent
- [x] Processing-volume guardrail — `selectFindingsForEnrichment` ported
      from the old cost guard, re-documented (bounds CPU work on a huge
      scan, not spend — there is no spend) (4 tests)
- [x] Computed on read, not persisted: `ListFindingsByScanUseCase` calls
      `buildEnrichmentsForScan` inline. The `AiFindingEnrichment` table
      (Phase 4's schema) stays unused — nothing regresses by leaving it,
      and a real-LLM phase later would still want it for caching
- [x] `GenerateReportUseCase` (Phase 9) attaches the same enrichment to
      every finding before building the report model, so generated
      reports carry it too, not just the live API: JSON gets it for free
      (full model serialization); the HTML generator renders an
      "Automated analysis" panel per finding (labeled the same as the
      dashboard, never "AI"); the PDF generator adds the same two lines.
      SARIF deliberately left unenriched — its consumers (CI/GitHub code
      scanning) don't render prose well, and cramming it into
      `properties` would be clutter for no real benefit
- [x] Phase 10's dashboard panel label changed from "AI analysis" to
      "Automated analysis" — calling template output "AI" when no model
      is involved would misrepresent what happened
- [x] Tests: 4 files / 28 tests in `packages/enrichment` (selection,
      explanation rules incl. category fallback, business-impact matrix
      across all 12 categories, batch enrichment incl. real correlation),
      3 tests for `correlateByFile` — all pure functions, no mocking of
      any kind needed (a strict improvement over the old fake-`LlmProvider`
      tests, since there's no provider boundary left to fake)
- [x] Verified: full monorepo — 21 packages build/typecheck/lint clean;
      every test suite passes

### Epic 9 — Reporting engine (Phase 9) — DONE

Closed 3 real gaps found while scoping (see ADR-0019): no object storage
port/adapter existed despite ADR-0009 anticipating one; `ReportRepository`
had no `create`; `FindingRepository` had no way to fetch all findings for
a specific scan.

- [x] `ObjectStorage` port (core) + `LocalFilesystemObjectStorage` adapter
      (new `packages/storage`) — real filesystem I/O in tests (temp dir per
      test, real `mkdir`/`writeFile`/`readFile`), including a path-traversal
      rejection test (`../` escapes, absolute keys)
- [x] `FindingRepository.listByScan`, `ReportRepository.create` (upsert on
      the existing `@@unique([scanId, format])`) — port + Prisma + in-memory
      test double for each. `PrismaReportRepository.create` uses
      `prisma.report.upsert` on `scanId_format`, not `create`
- [x] Normalized report model shared by all 4 generators (health score +
      severity/category aggregates; formula documented in ADR-0019, verified
      by hand-computed test cases including the floor-at-0 case)
- [x] SARIF generator — real v2.1.0 schema (`$schema`, `version`, driver +
      rules + results), severity→level mapping verified per band
      (critical/high→error, medium→warning, low/info→note), rule
      deduplication by ruleId verified against a repeated ruleId
- [x] JSON generator — full model, round-tripped through real `JSON.parse`
- [x] HTML generator — single self-contained file, native `<details>` for
      interactivity, zero external `<script>`/`<link>` tags (asserted), and
      an explicit XSS test proving finding content (title/rootCause) is
      HTML-escaped rather than injected raw
- [x] PDF generator (`pdfkit`) — real generated bytes verified: `%PDF-`
      header, `%%EOF` trailer, non-trivial size; handles zero findings
      without throwing
- [x] `GenerateReportUseCase` (loads scan+repo+findings, builds the model,
      generates, persists via `ObjectStorage` + `ReportRepository`) and
      `GetReportContentUseCase`; `POST /scans/:scanId/reports`,
      `GET /reports/:id/content` (correct `Content-Type` per format)
- [x] Tests: 14 generator/model tests in `packages/reporting`, 7 storage
      adapter tests, 6 use-case tests (including cross-scan isolation and
      the upsert-not-duplicate behavior) and 5 controller tests in
      `apps/api` — all real generator/storage code paths, no mocking
- [x] Verified: full monorepo — 20 packages build/typecheck/lint clean;
      every test suite passes, including the real Semgrep/gitleaks/
      OSV-Scanner/ESLint/jscpd/madge runs from Phase 7 (unaffected by this
      phase's changes)

### Epic 10 — Frontend dashboard (Phase 10) — DONE

Required 3 small, real API extensions the read side never needed until now:
`ScanRepository.listByRepo`, `GetScanSummaryUseCase` (health score without
generating/persisting a full report — reuses `@cqp/reporting`'s
`computeReportSummary`, now exported directly for this), and
`ListFindingsByScanUseCase` (thin wrapper over Phase 9's
`FindingRepository.listByScan`). New endpoints: `GET /scans?repoId=`,
`GET /scans/:id/summary`, `GET /scans/:id/findings`.

- [x] Score tiles: Overall Health, Open Findings, Critical+High,
      Technical Debt Items — all real, computed server-side from
      `ReportSummary`, no invented client-side scoring
- [x] Vulnerability/findings list with severity/status/category filtering
      (client-side — a single scan's finding set is bounded, no server
      round trip per filter change)
- [x] Health trend chart over scan history (real Recharts, real
      per-scan summaries — replaces the Phase 3 fixture)
- [x] AI recommendations panel — renders `finding.ai` when present,
      otherwise an honest "not yet run" note (Phase 8 is deferred to a
      rule-based/template approach per explicit user decision, no live
      LLM calls; this panel works unchanged either way)
- [x] Scan history list + scan detail view + repo detail view
- [x] Dependency graph — kept as the Phase 3 preview, honestly labeled
      in the UI as a preview (real graph data needs the worker pipeline,
      out of scope here)
- [x] Login flow: token → `POST /auth/session` → httpOnly cookie
      (ADR-0014). Vite dev proxies `/api/*` → the API's `:3000`, rewriting
      the prefix, so the browser sees same-origin requests — required
      for the `SameSite=Strict` cookie to be sent at all; a production
      deploy's reverse proxy plays the same role
- [x] Report generation + download wired to Phase 9's real endpoints
      (`POST /scans/:id/reports`, `GET /reports/:id/content`)
- [x] Component tests (5 files, 7 tests) against a **real local HTTP
      server** (`src/test/local-api-server.ts` — real TCP/JSON, no
      `fetch` mocking) standing in for `apps/api`, plus a full-stack
      `apps/api` e2e test (`dashboard-flow.e2e.spec.ts`) booting the
      real `AppModule` with every repository swapped for its in-memory
      double, walking repo → scan → findings → summary → generate
      report → download content over real HTTP
- [x] Found and fixed two real bugs while building this phase's tests,
      not just app code:
  - `GET /reports/:id/content` was JSON-serializing the returned Buffer
    into `{type:"Buffer",data:[...]}` instead of sending raw bytes —
    `@Res({passthrough:true})` + returning a Buffer doesn't do what it
    looks like it does in Nest. Every downloaded report (json/sarif/
    html/pdf) would have been corrupted in production. Fixed by using
    plain `@Res()` and calling `res.send()` directly. Caught by the
    full-stack e2e test, not any per-controller unit test.
  - `apps/web`'s Vitest config has no `test.globals: true`, so
    `@testing-library/react`'s automatic per-test DOM cleanup was
    silently never registering — multiple tests in the same file were
    colliding on `getByText`/`getByRole`. Fixed by wiring
    `afterEach(cleanup)` explicitly in `src/test/setup.ts`.
- [x] Verified: full monorepo — 20 packages build/typecheck clean; lint
      clean except 2 non-blocking complexity warnings in the local test
      HTTP server; every test suite passes, including the real Semgrep/
      gitleaks/OSV-Scanner/ESLint/jscpd/madge runs from Phase 7

### Epic 11 — Worker wiring: making the platform actually runnable (post-Phase-10) — DONE

Closes the gap every prior phase deliberately deferred rather than
forgot: ADR-0006 (worker skeleton, no real connection), ADR-0018
("wiring into apps/worker... is explicitly a later step"), ADR-0009
(fingerprint upsert, "Phase 7's job"). Before this, `POST /scans`
created a row that sat at `queued` forever — see ADR-0021 for the full
design.

- [x] `Repo.localPath` (new nullable column + migration) — a repo is
      only actually scannable if `provider: 'local'` and this is set;
      no clone-from-remote exists (ADR-0003 stands). Exposed through
      `CreateRepoRequestDto`, the dashboard's create-repo form, and
      shown per-repo in the list
- [x] `FindingRepository.upsertFromScan` — real match-on-`(repoId,
fingerprint)` upsert (the schema's `@@unique` constraint from
      Phase 4, finally used): update-and-reopen on a hit, insert on a
      miss, always writing a `FindingHistory` row. Implemented as a
      single Prisma interactive transaction
- [x] `ScanRepository.updateStatus` — drives `queued → running →
completed|failed`, stamping `startedAt`/`completedAt` once each
- [x] `ScanQueue` port (core) + `BullMqScanQueue` adapter (new
      `packages/queue`, shared by `apps/api` as producer and
      `apps/worker` as consumer so neither app depends on the other) —
      `CreateScanUseCase` now enqueues after creating the row; this is
      the one thing every prior phase left as inert
- [x] `RunScanUseCase` (packages/application, framework-free): status
      transitions, real target resolution (full vs. incremental via
      Phase 7's real `computeChangedFiles`), real `runScan` dispatch,
      per-finding fingerprint + upsert, partial-plugin-failure handling
      (logged, doesn't fail the scan — ADR-0018's rule preserved)
- [x] `apps/worker`'s placeholder `main.ts` replaced with a real
      bootstrap: `REDIS_URL`, graceful shutdown, real BullMQ `Worker`
      calling `RunScanUseCase` against real Prisma repositories
- [x] Tests: **2 real end-to-end integration tests** in
      `packages/application` — the actual Phase 7 plugin fleet against
      a real fixture directory, in-memory repositories (no Postgres/
      Redis needed to prove the orchestration correct) — proving (a) a
      full run persists a real finding and (b) running the same repo
      twice dedups via fingerprint (`firstSeenScanId` stays pinned,
      `lastSeenScanId` advances) rather than duplicating rows. Plus 3
      fast unit tests for the invariant-violation paths (unknown scan/
      repo, no local checkout) — 25 tests total in `packages/application`
- [x] Found a real bug while writing the fixture: assumed ESLint would
      report plain `no-unused-vars`; the actual baseline config reports
      `@typescript-eslint/no-unused-vars`. Fixed the assertion to match
      reality rather than adjusting the fixture to match the assumption
- [x] Verified: full monorepo (22 packages/apps) builds/typechecks/lints
      clean; every test suite passes. `BullMqScanQueue` and the Prisma
      adapter methods (`upsertFromScan`, `updateStatus`, `localPath`)
      are compiled/typechecked but not live-exercised against real
      Postgres/Redis in this pass — the same treatment every Prisma
      adapter gets without a live DB session (see
      `docs/architecture/dev-database.md` for how to close that
      specific gap if wanted)

### Epic 12 — One-click local experience: email login + launcher script — DONE

Direct user request: run everything from a click of a button, sign in
with just an email, no terminal-only setup step. See ADR-0022.

- [x] `POST /auth/login` — `{email}`, domain-restricted to `curatal.com`,
      no password/verification yet (explicit, interim — "we will build
      the authentication later"). Reuses ADR-0014's session-cookie
      mechanism unchanged: finds-or-creates the single shared `curatal`
      org and a `User` row, revokes that user's previous `ApiToken`(s),
      issues a fresh one, sets it as the cookie. `POST /auth/session`
      (real tokens, for CI per ADR-0016) is untouched
- [x] New domain surface: `User`/`UserRepository`, `Org`/`OrgRepository`
      (both new — `Org` was Prisma-only before this, never a port);
      `ApiTokenRepository.revokeAllByName`
- [x] Frontend: `LoginPage` now asks for an email, not a token
- [x] `start.ps1` — one-click local launcher: Docker Compose up, wait for
      Postgres, migrate, start api/worker/web each in their own window,
      open the browser. The operator bootstrap script is no longer part
      of the primary path (still there for CI token issuance)
- [x] Found and fixed a real bug while testing: the frontend's global
      401-handler treated a rejected _login attempt_ the same as an
      _expired session_ and tried to hard-navigate to `/login` — wrong
      for the one endpoint whose whole job is handling that rejection
      itself. Fixed by excluding `/auth/login` and `/auth/session` from
      the auto-redirect. Also closed a latent unhandled-promise-rejection
      pattern in every page with a form (`mutateAsync` called without a
      try/catch) while in the area
- [x] Tests: 5 new `auth.controller.spec.ts` tests, a new real-HTTP e2e
      case in `app.e2e.spec.ts`, 4 `LoginWithEmailUseCase` tests
      (rejects wrong domain, provisions shared org + user, reuses org/
      user but rotates the token across repeated logins, two different
      emails share one org), 2 frontend `LoginPage` tests (real login
      endpoint, real domain-rejection path) — all real, no mocking
- [x] Verified: full monorepo builds/typechecks/lints clean; every test
      suite passes
- [ ] **Explicitly not done, on direct instruction**: password, email
      verification, rate limiting on login. Documented in ADR-0022 and
      the README as a real, intentional gap — do not deploy this build
      reachable beyond a trusted network before replacing it

### Epic 13 — Real scan cancel, live progress, category selection, target picker — DONE

Direct user request after trying the app live and getting stuck scanning
`C:\CuratalIT` (a 25-project parent folder) with no way to stop it or see
what was happening. See ADR-0023.

- [x] Real cancellation, not cosmetic: a `queued` scan's BullMQ job is
      removed outright; a `running` scan is flipped to `cancelled` and
      actually stopped by `RunScanUseCase`'s own 1s DB-polling loop
      aborting an `AbortController` threaded through `runScan` ->
      `runIsolated` -> `worker.terminate()`. Verified live: a scan
      cancelled at 4/6 plugins reached 6/6 "aborted" within ~2s, not left
      running in the background
- [x] Live progress: `Scan` gained `pluginsTotal`/`pluginsCompleted`/
      `currentPluginId`; the frontend's existing `GET /scans/:id` polls
      every 2s while non-terminal — no new endpoint needed
- [x] Category selection: `Scan.categories` (empty = everything);
      `RunScanUseCase` filters `builtinPlugins` before calling `runScan`.
      Verified live: selecting `code-quality` ran exactly 3 plugins
      instead of 6
- [x] `GET /fs/browse` — lets the browser pick a target folder instead of
      hand-typing a path, since browser/API/worker are all the same
      machine in this deployment model (ADR-0003)
- [x] Tests: real abort-signal tests in `plugin-runtime`/`scan-engine`,
      cancel/category/progress tests in `run-scan.use-case.spec.ts`,
      `cancel-scan.use-case.spec.ts`, `fs.controller.spec.ts`,
      `scan.controller.spec.ts`, plus frontend tests for the progress
      bar/cancel button/category checkboxes/folder browser
- [x] Verified: full monorepo (23 packages/apps) builds/typechecks/lints/
      tests clean; live-verified against the real running app (real
      cancel of a real in-flight scan, real category filtering)

### Epic 14 — LLM-generated Jest unit tests (Gemini), execution, reporting — DONE

Direct user request: point at a microservice/folder/file/function, get
real Jest test cases generated and executed, with a report. The one
deliberate, scoped exception to ADR-0020's no-LLM stance — see ADR-0024
for why (meaningful test assertions require inferring intent, which
static analysis can't do) and why Gemini specifically (an actual free
API tier, unlike Claude/OpenAI's pay-per-token-only APIs).

- [x] Two new packages: `@cqp/unit-test-engine` (file discovery capped at
      15 files, real TypeScript-compiler-API function extraction, real
      jest execution + JSON-report parsing) and
      `@cqp/gemini-test-generator` (the one `@google/genai` call site in
      the whole platform)
- [x] `UnitTestRun`/`GeneratedTestFile`/`TestCaseResult` — same
      summary-plus-detail-rows shape as `Scan`/`Finding`; same
      queued/running/completed/failed/cancelled lifecycle, cancellation,
      and live-progress pattern as ADR-0023, on a separate `unit-tests`
      BullMQ queue so a slow LLM-backed run never blocks scans
- [x] Real Windows `spawn()` gotcha found and fixed: `jest.cmd` (a batch
      shim) can't run under `child_process.spawn()` without `shell:
true`, which this codebase avoids everywhere for argument-
      injection reasons — fixed by resolving past the shim to jest's
      real `bin/jest.js` and invoking it via `node` directly
- [x] `GET /fs/browse?includeFiles=true` — reused for picking a unit-test
      file/folder target rather than building a second picker
- [x] Verified live, end to end, against the real Gemini API: generated
      10 genuinely good Jest tests (edge cases included, unprompted) for
      a real two-function fixture, wrote them to disk, ran them for real
      with a real TypeScript transform, 10/10 passed. Also verified the
      failure path live: a target with no Jest config configured at all
      correctly failed with a clear error instead of a false "0/0"
      success
- [x] Tests: real end-to-end coverage in `unit-test-engine` (real jest
      execution, real AST parsing, real abort), `run-unit-test-
generation.use-case.spec.ts` (real jest, fake generator — the LLM
      itself is the one thing not re-called on every test run, same
      treatment as Postgres/Redis), `unit-test.controller.spec.ts`,
      frontend tests for the generate-tests form and results page
- [x] Verified: full monorepo (25 packages/apps) builds/typechecks/lints/
      tests clean
- [ ] **Documented gaps, not silently accepted**: no CommonJS export
      detection (`module.exports.foo = ...` — common in real Node/
      Express backends, not just ESM `export`), no class/method support,
      no override for the 15-file discovery cap

## Explicitly deferred (not in current backlog, see ADR-0003 / ADR-0004)

- Multi-tenant isolation hardening, billing, org management UI
- GitHub/GitLab App (OAuth, webhooks, PR status checks), published CI Action/template
- Automatic PR creation from AI-drafted patches
- Languages/frameworks beyond initial JS/TS/Node/React/Next.js/Docker/CI set
