import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import {
  InMemoryFindingRepository,
  InMemoryRepoRepository,
  InMemoryScanRepository,
} from './testing/index.js';
import { GetScanSummaryUseCase } from './get-scan-summary.use-case.js';
import { GetScanUseCase } from './get-scan.use-case.js';

function makeFinding(
  overrides: Partial<Finding> & { id: string; scanId: string; orgId: string; repoId: string },
): Finding {
  return {
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

describe('GetScanSummaryUseCase', () => {
  it('computes the health score from findings scoped to that scan only', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const scanRepository = new InMemoryScanRepository();
    const findingRepository = new InMemoryFindingRepository();

    const repo = await repoRepository.create({ orgId: 'org_1', name: 'r' });
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    findingRepository.seed(
      makeFinding({
        id: 'f1',
        scanId: scan.id,
        orgId: 'org_1',
        repoId: repo.id,
        severity: 'critical',
      }),
    );
    findingRepository.seed(
      makeFinding({
        id: 'f2',
        scanId: 'other_scan',
        orgId: 'org_1',
        repoId: repo.id,
        severity: 'critical',
      }),
    );

    const useCase = new GetScanSummaryUseCase(
      new GetScanUseCase(scanRepository),
      findingRepository,
    );
    const summary = await useCase.execute('org_1', scan.id);

    expect(summary.totalFindings).toBe(1); // f2 belongs to a different scan
    expect(summary.healthScore).toBe(75); // 100 - critical(25)
  });

  it('rejects an unknown scanId', async () => {
    const scanRepository = new InMemoryScanRepository();
    const findingRepository = new InMemoryFindingRepository();
    const useCase = new GetScanSummaryUseCase(
      new GetScanUseCase(scanRepository),
      findingRepository,
    );

    await expect(useCase.execute('org_1', 'no-such-scan')).rejects.toThrow('Scan not found');
  });
});
