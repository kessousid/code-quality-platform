# ADR-0013: AI engine — structured prompt/response contracts and a hard cost guard

## Status

Superseded by [ADR-0020](0020-automated-enrichment-no-llm.md) — Phase 8
did not wire a real Claude API key per this ADR's plan. The user opted
out of LLM API cost entirely; `packages/ai` (the `LlmProvider`/
`AiEnrichmentService` described below) was deleted and replaced with
`packages/enrichment`, a deterministic rule-based engine. Left as
written below for the historical record of what Phase 5 actually built
and why — see ADR-0020 for what replaced it and why.

## Context

`packages/ai`'s `LlmProvider` (Phase 2) is deliberately low-level — text
messages in, text out. Left at that level, every call site would build its
own ad-hoc prompt string and parse the response by hand, and nothing would
stop a scan with thousands of findings from sending all of them to the LLM
(the architecture overview already flagged this as an open risk in Phase
1). Phase 5 needs to close both gaps at the design level, and prove the
parts that don't require an actual Claude API call are real, not just
typed.

## Decision

**Structured contracts above the raw provider.** `AiEnrichmentService` sits
between the orchestrator and `LlmProvider`: it takes a `Finding`, builds a
prompt, calls `LlmProvider.complete()`, and parses the response into
`packages/core`'s existing `AiEnrichment` shape (`plainEnglishExplanation`,
`businessImpact`, `suggestedPatch`, `patchConfidence`) — never a raw string
handed back to the caller.

**Cost guard runs before any LLM call, not after.**
`selectFindingsForEnrichment(findings, maxCount)` is a pure, synchronous
pre-filter: sorts by severity then confidence and takes the top `maxCount`.
Nothing downstream of this function ever sees the findings it excludes —
there is no code path where "enrich everything, then truncate the results"
is possible, because the truncation happens before any API call is
constructed, let alone sent.

**No real Claude API calls in this phase.** Wiring an actual API key and
making real calls is explicitly Phase 8's job, and doing it now — without
being asked and without a key on file — would mean spending the user's
money on calls this phase doesn't need. Everything testable without a real
key (the cost guard, prompt construction, response parsing) is implemented
and tested against a fake `LlmProvider` in this phase; nothing else is.

## Consequences

- `AiEnrichmentService`'s response parser has to be defensive: an LLM
  response is untrusted text, not a guaranteed JSON payload. It requests
  a structured JSON response in the prompt and fails closed (throws a
  typed `AiResponseParseError`, does not guess) if parsing fails, rather
  than passing malformed data into `AiEnrichment` fields that a report
  template will later render as-is.
- The cost guard's ordering (severity, then confidence) is a first cut
  tied to what's known now (the finding's own metadata). Once the
  correlation engine (Phase 8) can factor in reachability/business-impact
  signals, the guard's ranking should move there — this phase's version is
  intentionally simple, not final.
- Real cost/latency numbers (actual token counts, actual Claude latency)
  are unknown until Phase 8 makes real calls. This phase's guard bounds
  _how many_ findings get enriched per scan; it does not yet bound total
  tokens per request, which depends on real measurement.
