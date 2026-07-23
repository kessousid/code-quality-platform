# ADR-0018: Scan orchestrator — glob-based dispatch, per-plugin failure isolation, git-diff incremental mode

## Status

Accepted

## Context

Phase 5 built the isolation runtime (ADR-0011) and proved it works on
generic functions. Phase 7 needs the actual orchestrator that decides
_which_ plugins run against _which_ files, tolerates individual plugin
failures without losing the rest of the scan, and does something real
with `ScanTarget.changedFiles` (defined in Phase 2, unused until now) for
incremental scans.

## Decision

**`packages/scan-engine`** owns this, as a plain library — no NestJS, no
BullMQ — consistent with every other phase's Clean Architecture rule.

**File classification decides _whether a plugin runs at all_, not what it
scans internally.** Each plugin still scans its target directory using
its own tool's normal recursive behavior; the orchestrator's job is only
to skip a plugin entirely when it's clearly irrelevant:

```ts
function shouldRunPlugin(plugin: PluginDescriptor, target: ScanTarget): boolean {
  if (plugin.applicableGlobs.length === 0) return true; // repo-level (e.g. dependency graph)
  if (!target.changedFiles) return true; // full scan — let the tool decide
  return target.changedFiles.some((f) => plugin.applicableGlobs.some((g) => minimatch(f, g)));
}
```

**Incremental mode computes `changedFiles` via `git diff --name-only
<base>..<head>`** in the target repo — real `git`, shelled out, not a
reimplementation of diffing. This only works if the target is an actual
git checkout with both refs reachable locally; that's a precondition the
caller (Phase 8+'s worker integration) is responsible for, not something
this package can conjure from nothing.

**Dispatch reuses Phase 5's `runIsolated` directly** — every plugin
invocation is one `runIsolated` call. A plugin's module path is resolved
via `createRequire(import.meta.url).resolve('@cqp/plugin-semgrep')` (each
plugin package is a real dependency of `scan-engine`) then converted to a
`file://` URL — `pathToFileURL(...).href`, the same fix Phase 5's own test
suite needed on Windows.

**One plugin failing (error or timeout) never drops the rest of the
scan's findings.** The orchestrator's result carries a per-plugin status
list alongside the aggregated findings — a scan with 5 successful plugins
and 1 timed-out one is a complete result with a visible gap, not a failed
scan.

## Consequences

- Every plugin module needs a plain function export (not just the
  `AnalyzerPlugin` class) for `runIsolated` to call inside the worker —
  each plugin's `index.ts` adds `export default async function(context) {
return new XPlugin().run(context); }` alongside the class. This is
  boilerplate repeated per plugin, not something worth abstracting away
  at 6 instances.
- No DB/queue integration here — `scan-engine` takes a `ScanTarget` and
  returns findings in memory. Wiring it into `apps/worker`'s BullMQ
  consumer and persisting via `PrismaFindingRepository` is explicitly a
  later step, kept separate so this package's own tests never need Redis
  or Postgres to prove the engine itself works.
