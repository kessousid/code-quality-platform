import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import {
  GenerateReportUseCase,
  GetReportContentUseCase,
  GetReportUseCase,
  GetRepoUseCase,
  GetScanUseCase,
  ListReportsByScanUseCase,
} from '@cqp/application';
import {
  InMemoryFindingRepository,
  InMemoryObjectStorage,
  InMemoryRepoRepository,
  InMemoryReportRepository,
  InMemoryScanRepository,
} from '@cqp/application/testing';
import { ReportController } from './report.controller.js';

/**
 * Same vertical-slice pattern as ScanController's test (real DI, no
 * Prisma) — but this one also exercises the real `@cqp/reporting`
 * generators and a real `ObjectStorage` round trip via the in-memory
 * adapter, proving the whole Phase 9 pipeline end to end.
 */
async function buildTestingModule() {
  const repoRepository = new InMemoryRepoRepository();
  const scanRepository = new InMemoryScanRepository();
  const findingRepository = new InMemoryFindingRepository();
  const reportRepository = new InMemoryReportRepository();
  const objectStorage = new InMemoryObjectStorage();

  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const scan = await scanRepository.create({
    orgId: 'org_1',
    repoId: repo.id,
    ref: 'main',
    mode: 'full',
  });

  findingRepository.seed({
    id: 'f1',
    scanId: scan.id,
    orgId: 'org_1',
    repoId: repo.id,
    category: 'security',
    source: 'semgrep',
    ruleId: 'eval-detected',
    title: 'Use of eval()',
    severity: 'critical',
    confidence: 'high',
    locations: [{ filePath: 'src/a.js', startLine: 1 }],
    rootCause: 'x',
    riskDescription: 'y',
    recommendedFix: 'z',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: scan.id,
    lastSeenScanId: scan.id,
    status: 'open',
  });

  const moduleRef = await Test.createTestingModule({
    controllers: [ReportController],
    providers: [
      {
        provide: ListReportsByScanUseCase,
        useValue: new ListReportsByScanUseCase(reportRepository),
      },
      { provide: GetReportUseCase, useValue: new GetReportUseCase(reportRepository) },
      {
        provide: GenerateReportUseCase,
        useValue: new GenerateReportUseCase(
          new GetScanUseCase(scanRepository),
          new GetRepoUseCase(repoRepository),
          findingRepository,
          reportRepository,
          objectStorage,
        ),
      },
      {
        provide: GetReportContentUseCase,
        useValue: new GetReportContentUseCase(
          new GetReportUseCase(reportRepository),
          objectStorage,
        ),
      },
    ],
  }).compile();

  return { controller: moduleRef.get(ReportController), scan };
}

/** Captures what the controller sends via the plain (non-passthrough) `@Res()` — see report.controller.ts. */
function fakeResponse() {
  const headers: Record<string, string> = {};
  let sent: Buffer | undefined;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
      return res;
    },
    status: () => res,
    send: (body: Buffer) => {
      sent = body;
      return res;
    },
  } as unknown as Response;
  return { headers, res, getSent: () => sent! };
}

describe('ReportController', () => {
  it('generates a report, lists it for the scan, and downloads its real content with the right Content-Type', async () => {
    const { controller, scan } = await buildTestingModule();

    const generated = await controller.generate('org_1', scan.id, { format: 'json' });
    expect(generated.scanId).toBe(scan.id);
    expect(generated.format).toBe('json');

    const listed = await controller.listByScan('org_1', scan.id);
    expect(listed.map((r) => r.id)).toEqual([generated.id]);

    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);
    expect(headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(getSent().toString());
    expect(parsed.findings).toHaveLength(1);
  });

  it('generates a real PDF via the controller and downloads it with the pdf Content-Type', async () => {
    const { controller, scan } = await buildTestingModule();

    const generated = await controller.generate('org_1', scan.id, { format: 'pdf' });
    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);

    expect(headers['Content-Type']).toBe('application/pdf');
    expect(getSent().subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('404s fetching an unknown report', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.getById('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('404s downloading content for an unknown report', async () => {
    const { controller } = await buildTestingModule();
    const { res } = fakeResponse();
    await expect(controller.getContent('org_1', 'does-not-exist', res)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s generating a report for an unknown scan', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.generate('org_1', 'no-such-scan', { format: 'json' })).rejects.toThrow(
      'Scan not found',
    );
  });
});
