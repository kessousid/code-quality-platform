import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import { InMemoryFindingRepository } from './testing/index.js';
import { ListFindingsByScanUseCase } from './list-findings-by-scan.use-case.js';

function makeFinding(overrides: Partial<Finding> & { id: string; scanId: string }): Finding {
  return {
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'eval-detected',
    title: 'Use of eval()',
    severity: 'high',
    confidence: 'high',
    locations: [],
    rootCause: 'x',
    riskDescription: 'y',
    recommendedFix: 'z',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: overrides.scanId,
    lastSeenScanId: overrides.scanId,
    status: 'open',
    ...overrides,
  };
}

describe('ListFindingsByScanUseCase', () => {
  it('returns only findings whose lastSeenScanId matches the given scan', async () => {
    const repository = new InMemoryFindingRepository();
    repository.seed(makeFinding({ id: 'f1', scanId: 'scan_1' }));
    repository.seed(makeFinding({ id: 'f2', scanId: 'scan_2' }));

    const useCase = new ListFindingsByScanUseCase(repository);
    const result = await useCase.execute('org_1', 'scan_1');

    expect(result.map((f) => f.id)).toEqual(['f1']);
  });

  it('attaches real automated enrichment to every returned finding — no LLM call (see ADR-0020)', async () => {
    const repository = new InMemoryFindingRepository();
    repository.seed(makeFinding({ id: 'f1', scanId: 'scan_1' }));

    const result = await new ListFindingsByScanUseCase(repository).execute('org_1', 'scan_1');

    expect(result[0]?.ai?.plainEnglishExplanation.length).toBeGreaterThan(0);
    expect(result[0]?.ai?.businessImpact.length).toBeGreaterThan(0);
    expect(result[0]?.ai?.relatedFindingIds).toEqual([]);
  });
});
