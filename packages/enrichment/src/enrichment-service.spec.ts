import { describe, expect, it } from 'vitest';
import { buildEnrichment, buildEnrichmentsForScan } from './enrichment-service.js';
import { makeFinding } from './testing/fixtures.js';

describe('buildEnrichment', () => {
  it('never populates suggestedPatch/patchConfidence — see ADR-0020', () => {
    const enrichment = buildEnrichment(makeFinding({ id: 'f1' }), []);
    expect(enrichment.suggestedPatch).toBeUndefined();
    expect(enrichment.patchConfidence).toBeUndefined();
  });

  it('carries through the relatedFindingIds it was given', () => {
    const enrichment = buildEnrichment(makeFinding({ id: 'f1' }), ['f2', 'f3']);
    expect(enrichment.relatedFindingIds).toEqual(['f2', 'f3']);
  });
});

describe('buildEnrichmentsForScan', () => {
  it('computes real cross-file correlation for the batch and enriches every finding', () => {
    const findings = [
      makeFinding({ id: 'f1', locations: [{ filePath: 'src/a.ts', startLine: 1 }] }),
      makeFinding({ id: 'f2', locations: [{ filePath: 'src/a.ts', startLine: 9 }] }),
      makeFinding({ id: 'f3', locations: [{ filePath: 'src/b.ts', startLine: 1 }] }),
    ];

    const enrichments = buildEnrichmentsForScan(findings);

    expect(enrichments.get('f1')?.relatedFindingIds).toEqual(['f2']);
    expect(enrichments.get('f2')?.relatedFindingIds).toEqual(['f1']);
    expect(enrichments.get('f3')?.relatedFindingIds).toEqual([]);
    expect(enrichments.get('f1')?.plainEnglishExplanation.length).toBeGreaterThan(0);
    expect(enrichments.get('f1')?.businessImpact.length).toBeGreaterThan(0);
  });
});
