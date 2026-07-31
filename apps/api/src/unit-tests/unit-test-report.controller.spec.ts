import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import {
  GenerateUnitTestReportUseCase,
  GetUnitTestReportContentUseCase,
  GetUnitTestReportUseCase,
  GetUnitTestRunUseCase,
  ListUnitTestReportsByRunUseCase,
} from '@cqp/application';
import {
  InMemoryGeneratedTestFileRepository,
  InMemoryObjectStorage,
  InMemoryRepoRepository,
  InMemoryTestCaseResultRepository,
  InMemoryUnitTestReportRepository,
  InMemoryUnitTestRunRepository,
} from '@cqp/application/testing';
import { UnitTestReportController } from './unit-test-report.controller.js';

/** Mirrors ReportController's spec (docs/adr/0019, docs/adr/0024) — real DI, in-memory adapters, real generators. */
async function buildTestingModule() {
  const repoRepository = new InMemoryRepoRepository();
  const unitTestRunRepository = new InMemoryUnitTestRunRepository();
  const generatedTestFileRepository = new InMemoryGeneratedTestFileRepository();
  const testCaseResultRepository = new InMemoryTestCaseResultRepository();
  const unitTestReportRepository = new InMemoryUnitTestReportRepository();
  const objectStorage = new InMemoryObjectStorage();

  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const run = await unitTestRunRepository.create({
    orgId: 'org_1',
    repoId: repo.id,
    target: { path: 'src/math.ts' },
  });
  await unitTestRunRepository.updateStatus('org_1', run.id, 'running');
  await unitTestRunRepository.updateResultsSummary('org_1', run.id, {
    testsTotal: 1,
    testsPassed: 1,
    testsFailed: 0,
  });
  await unitTestRunRepository.updateStatus('org_1', run.id, 'completed');

  await generatedTestFileRepository.saveMany(run.id, [
    { sourceFilePath: 'src/math.ts', testFilePath: 'src/math.generated.test.ts' },
  ]);
  await testCaseResultRepository.saveMany(run.id, [
    { testFilePath: 'src/math.generated.test.ts', testName: 'adds', status: 'passed' },
  ]);

  const getUnitTestRunUseCase = new GetUnitTestRunUseCase(unitTestRunRepository);
  const getUnitTestReportUseCase = new GetUnitTestReportUseCase(unitTestReportRepository);

  const moduleRef = await Test.createTestingModule({
    controllers: [UnitTestReportController],
    providers: [
      {
        provide: ListUnitTestReportsByRunUseCase,
        useValue: new ListUnitTestReportsByRunUseCase(unitTestReportRepository),
      },
      { provide: GetUnitTestReportUseCase, useValue: getUnitTestReportUseCase },
      {
        provide: GenerateUnitTestReportUseCase,
        useValue: new GenerateUnitTestReportUseCase(
          getUnitTestRunUseCase,
          generatedTestFileRepository,
          testCaseResultRepository,
          unitTestReportRepository,
          objectStorage,
        ),
      },
      {
        provide: GetUnitTestReportContentUseCase,
        useValue: new GetUnitTestReportContentUseCase(getUnitTestReportUseCase, objectStorage),
      },
    ],
  }).compile();

  return { controller: moduleRef.get(UnitTestReportController), run };
}

/** Captures what the controller sends via the plain (non-passthrough) `@Res()` — see unit-test-report.controller.ts. */
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

describe('UnitTestReportController', () => {
  it('generates a report, lists it for the run, and downloads its real content with the right Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'json' });
    expect(generated.unitTestRunId).toBe(run.id);
    expect(generated.format).toBe('json');

    const listed = await controller.listByRun('org_1', run.id);
    expect(listed.map((r) => r.id)).toEqual([generated.id]);

    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);
    expect(headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(getSent().toString());
    expect(parsed.results).toHaveLength(1);
  });

  it('generates a real PDF via the controller and downloads it with the pdf Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'pdf' });
    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);

    expect(headers['Content-Type']).toBe('application/pdf');
    expect(getSent().subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates a real xlsx workbook via the controller and downloads it with the spreadsheet Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'xlsx' });
    const { headers, res, getSent } = fakeResponse();
    await controller.getContent('org_1', generated.id, res);

    expect(headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // A real .xlsx is a zip archive — starts with the PK magic bytes.
    expect(getSent().subarray(0, 2).toString('ascii')).toBe('PK');
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
      'UnitTestRun not found',
    );
  });
});
