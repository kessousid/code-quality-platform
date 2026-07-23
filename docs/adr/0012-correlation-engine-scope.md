# ADR-0012: Correlation engine — fingerprint dedup now, graph-based correlation in Phase 8

## Status

Accepted

## Context

The architecture overview's scan lifecycle has a distinct correlation step
between "plugins run" and "AI enrichment." The backlog splits this across
two phases: Phase 5 asks for the correlation engine's _internal design_
(input/output contract), Phase 8 asks for the actual "correlation/dedup
pass across plugin outputs" as part of the AI engine epic. That split only
makes sense if Phase 5 draws a real line between the deterministic part
(same issue, seen again — no AI or graph needed) and the part that
genuinely depends on the dependency graph and/or an LLM.

## Decision

Split into two packages with a hard boundary:

- **`packages/correlation`** (this phase): deterministic, structural,
  no AI, no graph traversal. Its one real job is computing a stable
  `fingerprint` for a raw plugin finding (category + ruleId + normalized
  file path + rule-specific discriminator) so the persistence layer
  (ADR-0009's `Finding.fingerprint` unique constraint) can tell "still the
  same issue" from "a new issue" across scans. This is pure and fully
  testable now — implemented and tested in this phase, not deferred.
- **Cross-file/cross-service correlation** (relating finding A in one
  service to finding B in another because the dependency graph connects
  them, or because an LLM judges them related) stays Phase 8's job, is
  explicitly out of `packages/correlation`'s scope, and is why
  `FindingCorrelation` (ADR-0009) is a separate, sparser table than the
  fingerprint dedup path — most findings will never have a correlation
  edge; every finding gets a fingerprint.

Contract for this phase:

```ts
computeFingerprint(input: {
  category: AnalysisCategory;
  ruleId: string;
  source: string;
  primaryFilePath: string;
}): string
```

Deliberately excludes line numbers — a finding whose line shifted because
of an unrelated edit above it in the same file is still the same finding;
fingerprinting on line number would silently create a duplicate `Finding`
row and defeat the lifecycle tracking ADR-0009 exists for.

## Consequences

- `packages/correlation`'s output feeds `packages/db`'s
  `PrismaFindingRepository` (Phase 6/7): fingerprint match → update
  existing row's `lastSeenScanId`; no match → insert new `Finding` with
  `firstSeenScanId = lastSeenScanId = currentScanId`. That upsert logic
  is Phase 7's job (it needs a live scan orchestrator and a live DB); this
  phase only guarantees the fingerprint itself is stable and testable.
- Excluding line numbers means two textually-different-but-same-rule
  findings in the same file at different unrelated lines could collide if
  the discriminator isn't specific enough. Revisit the fingerprint's input
  fields in Phase 7 against real plugin output before trusting it on a
  large repo — this phase's version is a deliberately simple first cut,
  not a final algorithm.
