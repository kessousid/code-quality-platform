import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import {
  InMemoryFindingRepository,
  InMemoryObjectStorage,
  InMemoryRepoRepository,
  InMemoryReportRepository,
  InMemoryScanRepository,
} from './testing/index.js';
import { GenerateReportUseCase } from './generate-report.use-case.js';
import { GetRepoUseCase } from './get-repo.use-case.js';
import { GetScanUseCase } from './get-scan.use-case.js';
import { GetReportUseCase } from './get-report.use-case.js';
import { GetReportContentUseCase } from './get-report-content.use-case.js';

function makeFinding(overrides: Partial<Finding> & { id: string; scanId: string }): Finding {
  return {
    orgId: 'org_1',
    repoId: 'repo_x',
    category: 'security',
    source: 'semgrep',
    ruleId: 'eval-detected',
    title: 'Use of eval()',
    severity: 'high',
    confidence: 'high',
    locations: [{ filePath: 'src/a.js', startLine: 1 }],
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

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const scanRepository = new InMemoryScanRepository();
  const findingRepository = new InMemoryFindingRepository();
  const reportRepository = new InMemoryReportRepository();
  const objectStorage = new InMemoryObjectStorage();

  const repo = await repoRepository.create({ orgId: 'org_1', name: 'sample-repo' });
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
    makeFinding({ id: 'f2', scanId: scan.id, orgId: 'org_1', repoId: repo.id, severity: 'low' }),
  );
  // Belongs to a different scan — must not leak into this scan's report.
  findingRepository.seed(
    makeFinding({ id: 'f3', scanId: 'scan_other', orgId: 'org_1', repoId: repo.id }),
  );

  const useCase = new GenerateReportUseCase(
    new GetScanUseCase(scanRepository),
    new GetRepoUseCase(repoRepository),
    findingRepository,
    reportRepository,
    objectStorage,
  );

  return { repo, scan, useCase, reportRepository, objectStorage };
}

describe('GenerateReportUseCase', () => {
  it('generates a JSON report scoped to the given scan only and persists it', async () => {
    const { scan, useCase, reportRepository, objectStorage } = await setUp();

    const report = await useCase.execute('org_1', scan.id, 'json');

    expect(report.scanId).toBe(scan.id);
    expect(report.format).toBe('json');
    expect(report.storageKey).toBe(`reports/org_1/${scan.id}/json.json`);

    const persisted = await reportRepository.findById('org_1', report.id);
    expect(persisted).not.toBeNull();

    const content = JSON.parse((await objectStorage.get(report.storageKey)).toString('utf-8'));
    expect(content.findings).toHaveLength(2); // f1, f2 — not f3 from the other scan
    expect(content.summary.healthScore).toBe(74); // 100 - critical(25) - low(1)
  });

  it('attaches real automated enrichment to every finding in the report — never a real LLM call (see ADR-0020)', async () => {
    const { scan, useCase, objectStorage } = await setUp();

    const report = await useCase.execute('org_1', scan.id, 'json');
    const content = JSON.parse((await objectStorage.get(report.storageKey)).toString('utf-8'));

    for (const finding of content.findings) {
      expect(finding.ai.plainEnglishExplanation.length).toBeGreaterThan(0);
      expect(finding.ai.businessImpact.length).toBeGreaterThan(0);
      expect(finding.ai.suggestedPatch).toBeUndefined();
    }
  });

  it('generates a real SARIF report end to end', async () => {
    const { scan, useCase, objectStorage } = await setUp();

    const report = await useCase.execute('org_1', scan.id, 'sarif');
    const sarif = JSON.parse((await objectStorage.get(report.storageKey)).toString('utf-8'));

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results).toHaveLength(2);
  });

  it('generates a real PDF report end to end', async () => {
    const { scan, useCase, objectStorage } = await setUp();

    const report = await useCase.execute('org_1', scan.id, 'pdf');
    const buffer = await objectStorage.get(report.storageKey);

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('regenerating the same format for the same scan upserts rather than duplicating', async () => {
    const { scan, useCase, reportRepository } = await setUp();

    const first = await useCase.execute('org_1', scan.id, 'html');
    const second = await useCase.execute('org_1', scan.id, 'html');

    expect(second.id).toBe(first.id);
    const all = await reportRepository.listByScan('org_1', scan.id);
    expect(all.filter((r) => r.format === 'html')).toHaveLength(1);
  });

  it('rejects a scanId that does not exist', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-scan', 'json')).rejects.toThrow(
      'Scan not found',
    );
  });
});

describe('GetReportContentUseCase', () => {
  it('returns the report metadata plus the real generated bytes', async () => {
    const { scan, useCase, reportRepository, objectStorage } = await setUp();
    const report = await useCase.execute('org_1', scan.id, 'json');

    const contentUseCase = new GetReportContentUseCase(
      new GetReportUseCase(reportRepository),
      objectStorage,
    );
    const result = await contentUseCase.execute('org_1', report.id);

    expect(result.report.id).toBe(report.id);
    expect(JSON.parse(result.content.toString('utf-8')).findings).toHaveLength(2);
  });
});
