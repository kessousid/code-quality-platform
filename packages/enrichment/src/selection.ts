import type { Confidence, Finding, Severity } from '@cqp/core';

/**
 * Bounds how many findings get enriched per scan (see ADR-0020). Under
 * the old LLM design this was a spend guard; the rule-based engine has
 * no per-call cost, but a huge scan can still have thousands of
 * findings, and bounding + prioritizing the set kept for enrichment is
 * still useful for consistent per-scan processing time. Pure and
 * synchronous — same logic as before, just no longer gating a paid call.
 */
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function selectFindingsForEnrichment(findings: Finding[], maxCount: number): Finding[] {
  if (maxCount < 0) {
    throw new Error('maxCount must be >= 0');
  }

  return [...findings]
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    })
    .slice(0, maxCount);
}
