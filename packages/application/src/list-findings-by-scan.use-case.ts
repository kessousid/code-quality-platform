import type { Finding, FindingRepository } from '@cqp/core';
import { buildEnrichmentsForScan } from '@cqp/enrichment';

/**
 * Unpaginated by design — see `FindingRepository.listByScan` (docs/adr/0019).
 * Attaches automated (rule-based, no LLM — see docs/adr/0020) enrichment
 * on every finding before returning. Computed on read every time, not
 * cached/persisted — see ADR-0020 for why that's fine at this cost.
 */
export class ListFindingsByScanUseCase {
  constructor(private readonly findingRepository: FindingRepository) {}

  async execute(orgId: string, scanId: string): Promise<Finding[]> {
    const findings = await this.findingRepository.listByScan(orgId, scanId);
    const enrichments = buildEnrichmentsForScan(findings);
    // buildEnrichmentsForScan populates one entry per input finding, so
    // this is never actually undefined — the `!` documents that
    // invariant rather than working around exactOptionalPropertyTypes.
    return findings.map((finding) => ({ ...finding, ai: enrichments.get(finding.id)! }));
  }
}
