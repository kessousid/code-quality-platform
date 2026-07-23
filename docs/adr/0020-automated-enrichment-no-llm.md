# ADR-0020: Rule-based automated enrichment — no LLM calls, supersedes ADR-0013's provider design

## Status

Accepted — supersedes the LLM-calling parts of ADR-0013.

## Context

ADR-0013 (Phase 5) built `packages/ai`: a provider-agnostic `LlmProvider`
interface, an `AiEnrichmentService` that prompts it and parses the
response, and a pre-call cost guard — deliberately with no real Claude API
key wired in, so Phase 5 could ship the structure without spending money.
Phase 8 was always going to be "wire a real key and make real calls."

The user explicitly declined that: no AI API usage, no cost, but the
underlying goal — explaining findings in plain language, translating
severity into business impact, relating findings to each other — still
stands, to be done "with some automation" instead.

## Decision

**Delete `packages/ai` outright, not deprecate it.** There is no code path
in this platform that calls an LLM. Keeping the provider interface around
unused would be exactly the kind of speculative, never-exercised
abstraction this project's own conventions argue against — if real LLM
integration is wanted later, it's a new, deliberate ADR at that time, not
a flag flip on dead code sitting here today.

**Replace it with `packages/enrichment`: pure, deterministic, rule-based.**
Same output shape as before (`Finding.ai: AiEnrichment` from
`packages/core` — untouched, so nothing downstream, including the Phase 10
dashboard panel, needed to change) but produced by template lookups and
severity/category tables instead of a model call. No network, no
API key, no per-call cost, no `AiResponseParseError`-style defensive
parsing — the output is exactly what the code says it is, always.

What's real and implemented:

- **`explainFinding`** — a lookup table keyed by `${source}/${ruleId}` for
  the known rules from Phase 7's 6 plugins, falling back to a
  category-level template that reframes the finding's own `rootCause`/
  `riskDescription` (already written by the plugin mapper) in a more
  reader-facing sentence, rather than inventing new facts about code the
  engine has never read.
- **`estimateBusinessImpact`** — a `category × severity` matrix producing
  a business-language sentence. This is genuinely new value no plugin
  currently provides (plugins speak in CWE/rule-id terms, not "what does
  this cost the business").
- **Cross-file correlation** (the piece ADR-0012 explicitly deferred to
  "Phase 8," not something new invented here) — added to
  `packages/correlation` (not a new package: ADR-0012 already frames
  "cross-file correlation" as correlation's job, just deferred) as
  `correlateByFile`: findings that share a location's file path are
  related. Deterministic, no graph traversal, no AI.

What's explicitly **not** faked:

- **`suggestedPatch`/`patchConfidence` stay unset.** Drafting a real patch
  requires reading the actual file content at the flagged location — this
  engine only ever sees `Finding` metadata, never source code. Populating
  a fake diff (or promoting `recommendedFix`'s prose as if it were one)
  would violate ADR-0004's human-in-the-loop patch model by putting
  something diff-shaped in front of a user who might trust it as one.
  Revisit only alongside real file access (which the worker/scan-engine
  has, but nothing wires it to this layer yet).

**Computed on read, never persisted.** The original AI design needed the
`AiFindingEnrichment` table specifically because a real LLM call is slow
and costs money — you compute it once and cache it. Rule-based enrichment
is neither: `ListFindingsByScanUseCase` computes it inline on every
request. The `AiFindingEnrichment` table (Phase 4's schema) stays unused
for now — nothing regresses by leaving it, and a future real-LLM phase
would still want it for exactly the reason it was built.

**User-facing label changed from "AI" to "Automated" wherever a human
reads it** (the Phase 10 dashboard panel, this document) — calling
template-driven text "AI analysis" when no model is involved would
misrepresent what actually happened, and that mislabeling is worse than
any inconsistency with the underlying (unrenamed) `AiEnrichment` type.

## What did not change

- `packages/core`'s `AiEnrichment` type, `Finding.ai` field name, and the
  `AiFindingEnrichment` Prisma model — renaming these is a mechanical,
  purely-cosmetic migration across every layer for zero behavioral gain.
  The type describes _what_ the data is (explanation, impact, patch,
  related findings), not _how_ it was produced; that's still accurate.
- `selectFindingsForEnrichment` (ADR-0013's pre-filter) moves to
  `packages/enrichment` unchanged in logic, re-documented: it's now a
  processing-volume bound (keep per-scan enrichment work consistent on a
  huge finding set), not a spend guard, but the same sort-by-severity-
  then-confidence-and-truncate behavior is just as useful either way.

## Consequences

- Enrichment quality is bounded by how many `${source}/${ruleId}` entries
  the lookup table covers. Unknown rules (most OSV-Scanner advisories,
  which are per-CVE/GHSA and unbounded in number) fall back to the
  category-level template — correct and non-empty, but generic. Growing
  the specific-rule table over time is the main lever for improving this,
  not a model upgrade.
- No cost/latency guardrail is needed for correctness (nothing to
  overspend on), but `selectFindingsForEnrichment` is kept anyway to
  bound CPU work on pathological scans (thousands of findings) — a
  performance concern, not a budget one.
- If real LLM-based enrichment is wanted later, `packages/enrichment`'s
  call site (`ListFindingsByScanUseCase`) is the one place that would
  need to switch from computed-on-read to computed-once-and-cached (via
  the still-unused `AiFindingEnrichment` table) — a new ADR's job, not
  something this decision tries to half-build now.
