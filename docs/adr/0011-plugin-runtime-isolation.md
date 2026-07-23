# ADR-0011: Plugin runtime — worker-thread isolation with enforced timeouts

## Status

Accepted

## Context

`packages/core`'s `AnalyzerPlugin.run()` (Phase 2) is just an interface —
nothing stops one plugin adapter from hanging, leaking memory, or throwing
in a way that takes the whole worker process down mid-scan, taking every
other plugin's in-flight results with it. Given several plugins in this
platform's own MVP list shell out to external binaries (Semgrep, gitleaks)
and parse arbitrarily large output, a hang or a malformed-output crash in
one adapter is a realistic failure mode, not a hypothetical one.

## Decision

Each plugin runs inside a Node `worker_thread`, not in the worker process
directly. The runtime (`packages/plugin-runtime`) is deliberately generic —
it knows nothing about `AnalyzerPlugin` or `Finding`; it isolates and runs
_any_ function, and the Phase 7 scan orchestrator is what wires actual
plugins through it. This keeps the isolation mechanism reusable and
testable on its own, without needing real plugin adapters to exist yet.

Contract:

```ts
runIsolated<TInput, TOutput>(
  target: { modulePath: string; exportName?: string },
  input: TInput,
  options: { timeoutMs: number },
): Promise<
  | { status: 'success'; result: TOutput }
  | { status: 'timeout' }
  | { status: 'error'; message: string }
>
```

- A hang past `timeoutMs` terminates the worker thread and resolves
  `{ status: 'timeout' }` — it does not reject and does not hang the caller.
- A thrown error inside the worker resolves `{ status: 'error', message }` —
  it never propagates as an unhandled rejection into the host process.
- Nothing about a single plugin's failure prevents the orchestrator (Phase 7) from continuing with the other plugins' results.

Memory/CPU resource limits (`resourceLimits` on `Worker`) are supported by
the same API surface but left at Node defaults for now — tune once a real
plugin's actual footprint is measured in Phase 7, not on a guess.

## Consequences

- Every plugin invocation pays worker-thread spin-up cost. Acceptable: a
  scan's plugin phase is already dominated by the underlying tool's own
  runtime (Semgrep's process spawn dwarfs a worker-thread start), not by
  this overhead.
- The worker entry point is compiled JS (`dist/worker-entry.js`), not run
  directly from TS source — `packages/plugin-runtime`'s test script builds
  before testing (`pretest: tsc -b`) so the worker file the runtime spawns
  actually exists. This is the one package in the monorepo where that
  ordering matters and is enforced explicitly, rather than incidentally
  working because `-r run build` happened to run first.
- This is genuinely exercised, not just typechecked: the test suite spawns
  real worker threads for a success case, a throwing case, and a
  timeout/hang case — no mocking, because `worker_threads` has no meaningful
  fake to substitute.
