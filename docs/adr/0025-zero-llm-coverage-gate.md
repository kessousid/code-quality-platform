# ADR-0025: Zero-LLM coverage gate

## Status

Accepted

## Context

ADR-0024 built LLM-generated Jest tests because meaningful assertions
require inferring intent, which static analysis cannot do. But the
platform's testing team already runs regression/smoke coverage via
Playwright, and the actual goal behind the unit-testing module turned
out to be different from "write tests for developers": **ensure every
line a developer writes is actually tested by a test the developer
wrote, checked before merging.**

Auto-generation — LLM-based or a deterministic snapshot/golden-master
alternative considered and rejected along the way — cannot serve that
goal: it writes the test, not the developer, so it can't verify the
developer tested their own code. What actually enforces the goal is a
**coverage gate**: run the repo's own existing, developer-written Jest
suite with `--coverage`, diff against a base branch, and fail if any
changed line lacks coverage. This requires zero LLM calls — it's
squarely inside ADR-0020's "no LLM calls" default, unlike ADR-0024's
deliberate, scoped exception. It becomes the **primary** flow of the
"Unit Testing" module; the Gemini generator (ADR-0024) becomes
secondary/optional, since generating tests and verifying developers
wrote their own are different, not-fully-overlapping goals.

## Decision

### Four load-bearing product decisions

1. **Diff scope: working tree vs. base ref, not `base..HEAD`.** A
   developer runs this mid-change, before committing everything — a
   committed-only diff would miss exactly the code they're actively
   working on. `git diff --unified=0 <baseRef> --` (no second ref)
   diffs the working tree, including uncommitted/staged edits.
2. **Gate criterion: zero-tolerance, not a percentage threshold.** Any
   changed line with no test hitting it fails the gate — the simplest
   rule that directly matches "every line a developer writes should be
   tested." Additionally, **a changed line executed only by a
   currently-failing test does not satisfy the gate** — Istanbul marks
   a line "hit" the moment it executes, regardless of whether the
   test's assertions later pass, so `gatePassed` requires
   `uncoveredLinesTotal === 0 AND testsFailed === 0`, not coverage
   alone.
3. **Bad base ref validated upfront**, not discovered mid-run: `git
rev-parse --verify <baseRef>` at run-creation time, rejected
   immediately (`BaseRefNotFoundError` → 400) before a worker slot is
   spent.
4. **Zero tests in the target repo is a legitimate result, not a
   crash.** Jest normally treats "no test files matched" as a hard
   error (exits 1, writes no report at all) — the engine passes
   `--passWithNoTests` so this flows through as a real 0%-covered,
   gate-failing result instead of an engine exception.

### Where the new logic lives, and why

- **Git diff logic extends `packages/scan-engine/src/incremental.ts`**,
  which already owns `computeChangedFiles` (ADR-0018's incremental-scan
  git-diff, file-level only). A second, unrelated home for "how this
  platform diffs a repo with git" would be a findability regression;
  coverage becomes the second consumer of the same primitive scanning
  was the first to need. New: `computeChangedLinesFromWorkingTree`
  (working-tree diff, line-level via `--unified=0` hunk parsing) and
  `verifyRefExists`. `computeChangedFiles` itself is left as-is (its
  existing bare `execFile` convention, inconsistent with every other
  shelled-out tool's `CQP_*_PATH`-override pattern per ADR-0017, is a
  separate, no-behavior-change cleanup — not bundled into this diff).
- **New package `packages/coverage-engine`**, depending on
  `@cqp/unit-test-engine` (for `resolveJestCommand`/`ensureJestAvailable`
  — promoted from private to exported, so the Windows `.cmd`-shim fix
  ADR-0024 already solved is reused, not re-solved) and `@cqp/scan-engine`
  (for the git-diff primitives above). It runs the target's own Jest
  suite with **no positional file pattern** — unlike `runJest`'s
  generation-flow invocation, which is deliberately scoped to specific
  generated files, this run must exercise whatever `testMatch` the
  repo's own Jest config already selects.
- **Coverage cross-referencing uses `istanbul-lib-coverage`'s own
  `getLineCoverage()` API** (line → hit count), not a hand-rolled walk
  of `statementMap`/`s` — the same primitive Istanbul's own reporters
  use internally. A changed line with hit count `0` is uncovered;
  `undefined` (not an instrumentable statement — a blank line, a
  comment, a closing brace) is excluded from the denominator entirely,
  matching how real coverage-diff tools (Codecov, Coveralls,
  `diff-cover`) treat non-coverable lines; a file entirely absent from
  the coverage map (never executed by any test) counts every changed
  line as uncovered.

### Pipeline shape mirrors the unit-test-generation pipeline on purpose

`CoverageRun` mirrors `UnitTestRun`'s lifecycle: `queued` → `running` →
`completed`/`failed`/`cancelled`, the same cross-process DB-polling
cancellation bridge, a separate BullMQ queue (`coverage-runs`) so this
run never blocks scan/unit-test throughput or vice versa, the same
downloadable JSON/HTML/PDF report pattern (`CoverageReport`, mirroring
`UnitTestReport`/ADR-0019). `RunCoverageGateUseCase` vs.
`RunUnitTestGenerationUseCase` is a deliberate copy of an already-solved
problem, same as ADR-0024 was itself a copy of `RunScanUseCase`.

### UI placement: primary section of the existing "Unit Testing" tab

No third top-level module. The module boundary the user asked to keep
("Code Quality & Security" vs. "Unit Testing," simple, no per-team
setup hassle) is about the _category of concern_, not the _mechanism_
that produces the tests — both the coverage gate and the Gemini
generator are "Unit Testing." The coverage gate renders first/open;
the Gemini form is demoted into a collapsed `<details>` beneath it.

## Consequences

- New package `packages/coverage-engine`; three new tables
  (`coverage_runs`, `coverage_file_results`, `coverage_reports`) — same
  summary-plus-detail-rows shape as every other run type on this
  platform, migration `20260721010000_add_coverage_gate`.
- New dependency: `istanbul-lib-coverage` (already a transitive
  dependency of Jest itself, declared directly since the engine calls
  its API).
- `packages/unit-test-engine`'s `resolveJestCommand`/`ensureJestAvailable`
  and `packages/scan-engine`'s git-diff module both gained new public
  surface area to support reuse from the new package — no behavior
  change to either.
- Known, documented gap for a future pass: plain `git diff` only sees
  tracked files — a brand-new file that hasn't been `git add`ed yet
  won't appear in the diff at all. Out of scope for this pass; would
  need a separate `git ls-files --others --exclude-standard` pass to
  include wholly-untracked files if that turns out to matter in
  practice.
