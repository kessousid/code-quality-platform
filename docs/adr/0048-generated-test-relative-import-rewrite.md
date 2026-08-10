# ADR-0048: Rewrite a generated test's relative imports for its real output location

## Status

Accepted

## Context

Live-verifying docs/adr/0047's GitHub-clone path (a real "Generate unit
tests" run against a real local repo, `daily-math-problem-solver`'s
sibling assessment project) hit a run that failed with:

> jest ran but found no tests among the generated files — check the
> target project's Jest config (testMatch/testPathIgnorePatterns)
> actually includes `*.generated.test.*` files.

That error message (`NoTestsFoundError`, `packages/unit-test-engine/src/run-jest.ts`)
is misleading — it's thrown whenever jest's JSON report says
`numTotalTests === 0`, which also happens when a test **suite fails to
load at all** (a module-resolution error before any `it()`/`test()`
block ever registers), not only when testMatch genuinely excludes the
file. Reproducing the exact `runJest` invocation directly confirmed the
real cause: `Cannot find module '../utils/catchAsync'`.

The actual bug: docs/adr/0038 moved every generated test off of sitting
directly next to its source file and into a mirrored
`Unit tests/<AI Based|Script based>/<source's own relative path>/` tree.
Both `JestTestGenerator` implementations, however, still write their
relative imports **as if co-located with the source** —
`GeminiJestTestGenerator`'s prompt literally said _"the test file will
be saved in the same directory as the source file"_, and
`ScriptJestTestGenerator`'s own `require('./' + importBase)` assumed the
same. Neither was ever updated when ADR-0038 changed the real output
location. Two distinct symptoms follow from this:

1. The generated test's own import of the module under test breaks once
   the source file isn't at repo root (the existing unit/orchestrator
   tests never caught this — every fixture used a root-level source
   file, where "same directory" and "repo root" coincide).
2. Worse: an LLM naturally copies verbatim any relative import it sees
   _inside_ the source file's own code when it needs to `jest.mock()` a
   dependency (e.g. `health.controller.js` does
   `require('../utils/catchAsync')`, so the generated test's
   `jest.mock('../utils/catchAsync', ...)` is a direct, reasonable copy)
   — that copied path is correct only if the test is genuinely
   co-located with the source, which it no longer is.

## Decision

**Keep both generators' own mental model simple and unchanged**: they
still write every relative import as if the test sat right next to the
source file — this is the easiest, most reliable contract for an LLM
(copying a sibling import verbatim from what it just read) and requires
no path arithmetic on the generator's part. `importBase` in both
`prompt-builder.ts` (Gemini) and `script-jest-test-generator.ts` (script)
is corrected to be the source's **basename** (not its full relative
path) so this "same directory" framing is actually self-consistent — it
was subtly wrong even before ADR-0038 for any nested source file, just
never exercised by a test.

**A new, deterministic rewrite step corrects every such import after
generation, before the file is written to disk.**
`rewriteRelativeImportsForOutputLocation()` (new,
`packages/unit-test-engine/src/rewrite-relative-imports.ts`) scans the
generated content for any `from '...'`, `require(...)`, `import(...)`,
`jest.mock(...)`, `jest.requireActual(...)`, or `jest.requireMock(...)`
whose specifier starts with `./` or `../`, resolves it **as if** the
test were saved in the source file's own directory, then re-expresses
that same real target as a path relative to the **actual** output
directory — using `path.posix` throughout so this behaves identically
on Railway's Linux worker and a developer's Windows/macOS one. This
fixes both the module-under-test import and any sibling-dependency
`jest.mock()` uniformly, without asking the generator (or an LLM) to
get the path arithmetic right itself. `runUnitTestGeneration`'s
`generateAndWriteTestFor` applies it right before `writeFile`, using
`file.relativePath` (already forward-slash normalized) and the real
`testRelativePath` it already computes.

## Consequences

- This is a correctness fix for **every** unit-test-generation run
  against a source file that isn't at repo root — local-worker and
  GitHub-clone alike, `gemini` and `script` generators alike. It's not
  scoped to the GitHub-clone feature; it just happened to be caught
  while verifying that feature live.
- New coverage: `rewrite-relative-imports.spec.ts` (pure function, 5
  cases including the exact root-cause scenario) and a new
  `orchestrator.spec.ts` case that reproduces the live failure end to
  end — a nested source file with a sibling relative `require`, a fake
  generator that writes both a same-directory module import and a
  verbatim-copied `jest.mock()` of that sibling, run through real jest
  execution, asserting `testsTotal: 1, testsPassed: 1` where it used to
  be `testsTotal: 0` with the misleading error above.
- `prompt-builder.spec.ts`'s existing assertion (`from './src/math'` for
  a nested `sourceFilePath`) changed to `from './math'` — the corrected,
  actually-self-consistent "same directory as source" import; nothing
  about the platform's own file-naming or output-tree behavior changed.
- The rewrite only ever touches specifiers starting with `./`/`../` — a
  bare package specifier (`from 'zod'`, `require('lodash')`) is left
  untouched, exactly as before.
