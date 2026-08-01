import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import {
  GenerateQaAutomationReportUseCase,
  GetQaAutomationReportContentUseCase,
  GetQaAutomationReportUseCase,
  GetQaAutomationRunUseCase,
  ListQaAutomationReportsByRunUseCase,
} from '@cqp/application';
import {
  InMemoryObjectStorage,
  InMemoryQaAutomationReportRepository,
  InMemoryQaAutomationRunRepository,
  InMemoryQaAutomationTestResultRepository,
} from '@cqp/application/testing';
import { QaAutomationReportController } from './qa-automation-report.controller.js';

/** Mirrors UnitTestReportController's spec exactly — real DI, in-memory adapters, real generators. */
async function buildTestingModule() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const reportRepository = new InMemoryQaAutomationReportRepository();
  const objectStorage = new InMemoryObjectStorage();

  const run = await runRepository.create({ orgId: 'org_1', triggeredBy: 'manual' });
  await resultRepository.create({
    runId: run.id,
    testId: 'slot-listing-pricing',
    testName: 'Slot listing pricing matches Sunday/weekday business rule',
    passed: true,
    details: 'ok',
  });
  await runRepository.complete('org_1', run.id, { status: 'completed' });

  const getQaAutomationRunUseCase = new GetQaAutomationRunUseCase(runRepository, resultRepository);
  const getQaAutomationReportUseCase = new GetQaAutomationReportUseCase(reportRepository);

  const moduleRef = await Test.createTestingModule({
    controllers: [QaAutomationReportController],
    providers: [
      {
        provide: ListQaAutomationReportsByRunUseCase,
        useValue: new ListQaAutomationReportsByRunUseCase(reportRepository),
      },
      { provide: GetQaAutomationReportUseCase, useValue: getQaAutomationReportUseCase },
      {
        provide: GenerateQaAutomationReportUseCase,
        useValue: new GenerateQaAutomationReportUseCase(
          getQaAutomationRunUseCase,
          reportRepository,
          objectStorage,
        ),
      },
      {
        provide: GetQaAutomationReportContentUseCase,
        useValue: new GetQaAutomationReportContentUseCase(
          getQaAutomationReportUseCase,
          objectStorage,
        ),
      },
    ],
  }).compile();

  return { controller: moduleRef.get(QaAutomationReportController), run };
}

/** Captures what the controller sends via the plain (non-passthrough) `@Res()` — see qa-automation-report.controller.ts. */
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

describe('QaAutomationReportController', () => {
  it('generates a real PDF, lists it for the run, and downloads its bytes with the pdf Content-Type', async () => {
    const { controller, run } = await buildTestingModule();

    const generated = await controller.generate('org_1', run.id, { format: 'pdf' });
    expect(generated.runId).toBe(run.id);
    expect(generated.format).toBe('pdf');

    const listed = await controller.listByRun('org_1', run.id);
    expect(listed.map((r) => r.id)).toEqual([generated.id]);

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
    await expect(controller.generate('org_1', 'no-such-run', { format: 'pdf' })).rejects.toThrow(
      'QaAutomationRun not found',
    );
  });
});
