# ADR-0024: LLM-generated Jest unit tests, execution, and reporting

## Status

Accepted

## Context

Everything built through ADR-0023 automates _finding problems in code
that already exists_ — static analysis, secret scanning, dependency
checks. The user asked for a genuinely different capability: point at a
microservice, folder, file, or function and get real Jest unit tests
generated and executed, with a report — a workflow developers run after
writing code, not instead of it.

This is not the same kind of problem as the scan pipeline, and the
difference matters architecturally: a rule-based approach (ADR-0020's
"no LLM calls" stance) can flag that a function _exists_ and scaffold
empty `describe`/`it` blocks, but it cannot know what the function is
_supposed_ to do — there is no static signal for "correct behavior" the
way there is for "this pattern is a known vulnerability." Meaningful
test assertions require inferring intent, which static analysis cannot
do. The user explicitly chose an LLM-based generator over rule-based
scaffolding for this reason, understanding the cost/architecture
tradeoff (a scoped, deliberate exception to ADR-0020, not a reversal of
it — the scan pipeline stays LLM-free).

### Why Gemini, not Claude

The user wanted this to be genuinely free to use at low/no volume.
Anthropic's and OpenAI's APIs are pay-per-token from the first call —
there is no free programmatic tier for either (their free tiers cover
only the consumer chat apps, which have no callable API for a backend
service). Google's Gemini API has an actual free tier via
[Google AI Studio](https://aistudio.google.com/apikey), which fits.
Verified live against a real key: `gemini-2.5-flash` and
`gemini-2.5-flash-lite` — despite still being listed by `models.list()`
— both 404 as "no longer available to new users." **`gemini-flash-latest`
is used instead**, an alias Google keeps pointed at its current
recommended flash model, specifically to avoid hardcoding a dated model
name that quietly stops working later the same way.

## Decision

### Pipeline shape mirrors the scan pipeline on purpose

`UnitTestRun` mirrors `Scan`'s entire lifecycle: `queued` → `running` →
`completed`/`failed`/`cancelled`, live progress (`filesTotal`/
`filesCompleted`/`currentFilePath`), the same cross-process DB-polling
cancellation bridge (ADR-0023), a separate BullMQ queue
(`unit-tests`, alongside `scans`) so a slow LLM-backed run never blocks
scan throughput or vice versa, and the same 2s frontend polling pattern.
This is a deliberate copy of an already-solved problem, not a new
design — see `RunUnitTestGenerationUseCase` vs. `RunScanUseCase`.

### The pipeline, end to end

1. **Target resolution** (`packages/unit-test-engine/discover-files.ts`):
   `UnitTestTarget.path` is a file or a directory relative to the repo's
   local checkout. A directory is walked (depth-first, sorted, skipping
   `node_modules`/`dist`/etc. and anything already looking like a test
   file) and capped at **15 files** — the same lesson as ADR-0023's
   `C:\CuratalIT` incident, except here an unbounded folder means an
   unbounded number of LLM calls, not just a slow scan.
2. **Function extraction** (`extract-functions.ts`): real TypeScript
   compiler API parsing (not regex) finds exported top-level function
   declarations and `const` arrow/function-expression assignments,
   `async` included. `functionName` narrows to one match and requires
   the target to resolve to exactly one file. **Scope limitation,
   documented not silently accepted**: exported classes/methods and
   anonymous `export default function() {}` aren't detected yet, and
   CommonJS (`module.exports.foo = ...`, extremely common in real
   Node/Express backends) isn't recognized at all — only ESM `export`
   syntax, matching this platform's own code style but not every real
   target's.
3. **Generation** (`packages/gemini-test-generator`): one Gemini call
   per file with at least one matched function, given the full source
   file for context. The prompt requires real assertions (not TODOs),
   at least one edge case, mocking of external dependencies, and no
   markdown fences — `extract-code.ts` strips a fence anyway if the
   model adds one regardless. Verified live: the model reliably produces
   genuinely good tests (10 real assertions across normal/negative/
   zero/floating-point cases for a two-function fixture, unprompted).
4. **Write + run**: the test file path is _always_ computed by the
   orchestrator as `<source>.generated.test.<ext>` next to the source —
   never trusted from the LLM's output, so there is no path a model
   response could use to write somewhere unexpected. `run-jest.ts`
   resolves `jest` the same way every other shelled-out tool in this
   codebase resolves a binary (`CQP_JEST_PATH` override, then the
   target's own `node_modules`, then PATH — ADR-0017), then runs it
   scoped to exactly the files this run generated (an OR'd regex of
   their paths, forward-slash-normalized to dodge a Windows path/regex
   escaping trap: a literal `\f`/`\b` right after a path separator reads
   as a regex escape, not a separator).
5. **Results**: Jest's `--json` report is parsed into one
   `TestCaseResult` row per assertion plus a run-level summary
   (`testsTotal`/`testsPassed`/`testsFailed`) — the same
   summary-plus-detail-rows split `Scan`/`Finding` already established.

### A real Windows `spawn()` gotcha, not a design choice

`node_modules/.bin/jest.cmd` is a batch script; `child_process.spawn()`
cannot execute `.cmd`/`.bat` files directly without `shell: true`, which
this codebase deliberately avoids everywhere else for argument-injection
reasons (`resolve-executable.ts`'s existing comment). The fix used
there — append `.exe` — doesn't apply to jest (no `.exe` exists).
Instead, `run-jest.ts` resolves past the shim to jest's real JS entry
point (`node_modules/jest/bin/jest.js`) and invokes it with the current
`node` binary directly: no shell, no batch file, same safety property.
Caught by real execution, not by reasoning about it — the first attempt
using the `.cmd` shim path silently produced no output at all under
`spawn()` despite working fine when run manually from a shell.

### Requires a real Jest install in the target — not a bug to work around

Running the LLM-generated `.ts`/`.tsx` file requires the target project
to already have a working transform (`ts-jest`, or babel with
`@babel/preset-typescript`) configured — this tool does not install or
configure one. This mirrors ADR-0017 exactly ("if a tool isn't
configured, fail clearly, don't paper over it") and is a reasonable
assumption for this feature's actual audience: a developer who already
runs Jest on their own project. Verified live end-to-end against a bare
target with no Jest config at all: the run correctly failed with
`NoTestsFoundError` rather than silently reporting a false "0 passed, 0
failed" success — then, against the same target with a real
`babel.config.cjs` + `@babel/preset-typescript` added, completed with
10/10 real tests passing.

### The paid/external LLM API is treated like infrastructure in tests

`FakeJestTestGenerator` (a deterministic in-memory double) is used for
every automated test — the same reasoning already applied to Postgres/
Redis (real end to end once, faked for the fast/free/repeatable CI-style
run). A live Gemini call is exercised manually, not on every test run,
for the same reason nothing in this suite calls a paid API per test
execution.

## Consequences

- Two new packages: `packages/unit-test-engine` (framework-free
  orchestration: discovery, AST extraction, jest execution/parsing) and
  `packages/gemini-test-generator` (the one real adapter for the
  `JestTestGenerator` port, isolating the only `@google/genai` import in
  the whole platform).
- Three new tables (`unit_test_runs`, `generated_test_files`,
  `test_case_results`) — same summary-plus-detail-rows shape as
  Scan/Finding, migration `20260720100000_add_unit_test_generation`.
- `GET /fs/browse` gained `?includeFiles=true` (default stays
  directories-only, for the existing repo-creation flow) — reused
  directly for picking a unit-test file/folder target rather than
  building a second picker.
- `GEMINI_API_KEY` joins `REDIS_URL` in the gitignored root `.env`; a
  missing key doesn't crash the API (unrelated features must keep
  working) — it surfaces as that run's own `failed` status with a real
  error message the first time a run actually needs it, constructed only
  in `apps/worker` (mirrors `RunScanUseCase`'s split — the API module
  never constructs the thing that does the actual work).
- Known, documented gaps for a future pass, not silently swallowed: no
  CommonJS export detection (real Node/Express backends commonly use
  `module.exports`, not ESM `export`), no class/method support, and the
  15-file cap has no override yet if a genuinely larger batch is wanted.
