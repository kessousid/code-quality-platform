import type { AiEnrichment, Finding } from '@cqp/core';
import { correlateByFile } from '@cqp/correlation';
import { estimateBusinessImpact } from './business-impact-rules.js';
import { explainFinding } from './explanation-rules.js';

/**
 * One finding's enrichment, given its already-computed related-finding
 * IDs (kept as a separate parameter, not recomputed here, so a single
 * finding can be enriched without needing the whole scan's finding set —
 * see `buildEnrichmentsForScan` below for the batch path that supplies
 * real correlation). `suggestedPatch`/`patchConfidence` are deliberately
 * left unset — see ADR-0020.
 */
export function buildEnrichment(finding: Finding, relatedFindingIds: string[]): AiEnrichment {
  return {
    plainEnglishExplanation: explainFinding(finding),
    businessImpact: estimateBusinessImpact(finding),
    relatedFindingIds,
  };
}

/** Computes real cross-file correlation (packages/correlation) once for the batch, then enriches every finding against it. */
export function buildEnrichmentsForScan(findings: Finding[]): Map<string, AiEnrichment> {
  const related = correlateByFile(findings);
  return new Map(findings.map((f) => [f.id, buildEnrichment(f, related.get(f.id) ?? [])]));
}
