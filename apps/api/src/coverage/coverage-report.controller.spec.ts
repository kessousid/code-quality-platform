import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import {
  GenerateCoverageReportUseCase,
  GetCoverageReportContentUseCase,
  GetCoverageReportUseCase,
  GetCoverageRunUseCase,
  ListCoverageReportsByRunUseCase,
} from '@cqp/application';
import {
  InMemoryCoverageFileResultRepository,
  InMemoryCoverageReportRepository,
  InMemoryCoverageRunRepository,
  InMemoryObjectStorage,
  InMemoryRepoRepository,
} from '@cqp/application/testing';
import { CoverageReportController } from './coverage-report.controller.js';

/** Mirrors UnitTestReportController's spec (docs/adr/0019, docs/adr/0025) — real DI, in-memory adapters, real generators. */
async function buildTestingModule() {
  const repoRepository = new InMemoryRepoRepository();
  const coverageRunRepository = new InMemoryCoverageRunRepository();
  const coverageFileResultRepository = new InMemoryCoverageFileResultRepository();
  const coverageReportRepository = new InMemoryCoverageReportRepository();
  const objectStorage = new InMemoryObjectStorage();

  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const run = await coverageRunRepository.create({
    orgId: 'org_1',
    repoId: repo.id,
    baseRef: 'main',
  });
  await coverageRunRepository.updateStatus('org_1', run.id, 'running');
  await coverageRunRepository.updateResultsSummary('org_1', run.id, {
    testsTotal: 1,
    testsPassed: 1,
    testsFailed: 0,
    changedLinesTotal: 1,
    uncoveredLinesTotal: 0,
    gatePassed: true,
  });
  await coverageRunRepository.updateStatus('org_1', run.id, 'completed');

  await coverageFileResultRepository.saveMany(run.id, [
    { filePath: 'src/math.ts', changedLines: [4], uncoveredLines: [], status: 'covered' },
  ]);

  const getCoverageRunUseCase = new GetCoverageRunUseCase(coverageRunRepository);
  const getCoverageReportUseCase = new GetCoverageReportUseCase(coverageReportRepository);

  const moduleRef = await Test.createTestingModule({
    controllers: [CoverageReportController],
    providers: [
      {
        provide: ListCoverageReportsByRunUseCase,
        useValue: new ListCoverageReportsByRunUseCase(coverageReportRepository),
      },
      { provide: GetCoverageReportUseCase, useValue: getCoverageReportUseCase },
      {
        provide: GenerateCoverageReportUseCase,
        useValue: new GenerateCoverageReportUseCase(
          getCoverageRunUseCase,
          coverageFileResultRepository,
          coverageReportRepository,
          objectStorage,
        ),
      },
      {
        provide: GetCoverageReportContentUseCase,
        useValue: new GetCoverageReportContentUseCase(getCoverageReportUseCase, objectStorage),
      },
    ],
  }).compile();

  return { controller: moduleRef.get(CoverageReportController), run };
}

/** Captures what the controller sends via the plain (non-passthrough) `@Res()` — see coverage-report.controller.ts. */
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

describe('CoverageReportController', () => {
  it('generates a report, lists it for the run, and downloads its real content with the right Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'json' });
    expect(generated.coverageRunId).toBe(run.id);
    expect(generated.format).toBe('json');

    const listed = await controller.listByRun('org_1', run.id);
    expect(listed.map((r) => r.id)).toEqual([generated.id]);

    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);
    expect(headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(getSent().toString());
    expect(parsed.fileResults).toHaveLength(1);
  });

  it('generates a real PDF via the controller and downloads it with the pdf Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'pdf' });
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

  it('404s generating a report for an unknown run', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.generate('org_1', 'no-such-run', { format: 'json' })).rejects.toThrow(
      'CoverageRun not found',
    );
  });
});
