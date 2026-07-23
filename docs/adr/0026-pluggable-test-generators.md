# ADR-0026: Pluggable test generators — a deterministic "script" generator alongside Gemini

## Status

Accepted

## Context

While verifying ADR-0025's coverage gate against a real repo, Gemini generated a test asserting `multiply(0, -10)` equals `0`, when the real IEEE-754/JavaScript result is `-0` (Jest's `.toBe()` uses `Object.is`, which distinguishes `-0` from `0`, unlike `==`/`===`). This is a concrete, real example of the LLM guessing a "plausible" expected value instead of knowing the true one — and it directly motivated two related requests:

1. A second, deterministic (zero-LLM) test generator — one that can't make this specific class of mistake, because instead of guessing an expected value, it actually executes the function and captures its real output as the assertion.
2. Making the LLM not hardcoded to Gemini — scoped explicitly to **architecture only**: Gemini remains the sole real LLM provider for now (no OpenAI/Claude keys wired up), but which generator runs is a per-request choice, not a constant in the worker.

Both requests land on the same mechanism: the `JestTestGenerator` port (`packages/core/src/jest-test-generator.ts`, ADR-0024) already exists as the abstraction boundary — `GeminiJestTestGenerator` was just its one implementation. The work here is adding a second implementation and a selection mechanism, not inventing a new abstraction.

## Decision

### Four load-bearing decisions

1. **`TestGeneratorType = 'gemini' | 'script'`**, stored on `UnitTestRun`, defaulting to `'gemini'` when omitted — every existing caller keeps working unchanged. The union exists specifically so a future provider is "add another case," not a redesign.
2. **Selection happens in the worker, per run, via a registry, not a single injected instance.** `RunUnitTestGenerationUseCase`'s constructor changed from a single `jestTestGenerator: JestTestGenerator` to `generators: Record<TestGeneratorType, JestTestGenerator>`; it resolves `this.generators[run.generator]` after loading the run. The worker job constructs both real generators once and hands over the whole map — no job-payload change was needed, since the use case already fetches the run row itself.
3. **The script generator does real, golden-master execution**, not a smarter guess. For each function: synthesize one plausible argument set from parameter _names_ (numeric-sounding → numbers, string-sounding → strings, boolean-sounding → `true`, array/object-sounding or destructured → `{}`/`[]`, anything unrecognized → `undefined`), then actually call the real function via `createRequire(import.meta.url)` + `require()` on the real file (fresh each time, cache cleared) inside a try/catch:
   - Threw → `expect(() => fn(...)).toThrow()`.
   - Returned (including a resolved/rejected promise for async functions) → `expect(fn(...)).toEqual(<literal>)`, using a serializer that gets `-0`/`NaN`/`Infinity`/`undefined` right — the exact class of value `JSON.stringify` mangles or drops, and exactly the class of value the motivating bug fell into.
   - `require()` itself fails for any reason (a `.ts` file's type annotations are never valid plain JS, a genuine syntax error, a module that throws on load) → fall back to a smoke assertion (`expect(typeof fn).toBe('function')`) instead of failing generation outright.
4. **`FunctionSignature` gained a `parameters: string[]` field**, populated directly in `packages/unit-test-engine/src/extract-functions.ts` at each point a declaration's AST node is already in hand — re-deriving parameter names later by re-parsing `sourceText` would have been redundant work against nodes already visited. `GenerateTestsInput` gained an optional `sourceFileAbsolutePath`, populated by the orchestrator from data `discoverSourceFiles` already computes; `GeminiJestTestGenerator` ignores both additions.

### A genuine surprise during implementation

The original plan assumed `require()` would reliably fail on ESM `export` syntax, giving the smoke-fallback path an easy, realistic trigger to test against. It doesn't, on the Node version this platform runs (Node 24): recent Node versions transparently support `require()` of synchronous ES modules. The fallback path is still real and still needed — a `.ts` file's type annotations remain unparseable JS regardless — but "any ESM-syntax file" is no longer a reliable way to trigger it. Caught by writing the real test against real Node, not by reasoning about what "should" happen — the same kind of gap earlier ADRs in this platform have repeatedly found only by executing, never by inspection alone.

### Two stated tradeoffs, not silently accepted

- **The script generator can't judge correctness either.** It will happily snapshot a genuine bug as "expected" forever — it only proves current behavior didn't guess wrong, not that the behavior is right. It also writes exactly one representative case per function, never the multi-case (edge-case, error-path) coverage Gemini produces.
- **The script generator executes arbitrary code from the target repo directly in the worker process, unsandboxed.** Acceptable under this platform's existing trust model — every plugin already runs against a trusted local checkout (ADR-0020) — but genuinely different from the Gemini path, where nothing but a prompt string ever leaves the process.

### UI

A generator selector (two radio options) sits in the standalone "Generate unit tests" form, defaulting to Gemini. The coverage gate's own one-click "Generate tests with Gemini" button (ADR-0025) stays fixed to Gemini specifically — its label says so — rather than gaining a second choice there.

## Consequences

- New package `packages/script-test-generator` (`@cqp/core` as its only real dependency — no LLM SDK).
- New migration `20260721020000_add_unit_test_generator_selection` (new `TestGeneratorType` enum, new `generator` column on `unit_test_runs`, defaulting to `GEMINI`).
- `packages/unit-test-engine/src/extract-functions.ts` and its `FunctionSignature`/`GenerateTestsInput` port additions are purely additive — no existing behavior changed for the Gemini path.
- Known, documented gap for a future pass: the argument-synthesis heuristics are name-based only, no real type inference (not even from TypeScript's own type annotations, when present) — a parameter named something the heuristics don't recognize falls back to `undefined`, which is often a legitimate, if unremarkable, test case.
