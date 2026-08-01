import { describe, expect, it } from 'vitest';
import {
  InMemoryObjectStorage,
  InMemoryQaAutomationReportRepository,
  InMemoryQaAutomationRunRepository,
  InMemoryQaAutomationTestResultRepository,
} from './testing/index.js';
import { GenerateQaAutomationReportUseCase } from './generate-qa-automation-report.use-case.js';
import { GetQaAutomationRunUseCase } from './get-qa-automation-run.use-case.js';
import { GetQaAutomationReportUseCase } from './get-qa-automation-report.use-case.js';
import { GetQaAutomationReportContentUseCase } from './get-qa-automation-report-content.use-case.js';

async function setUp() {
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
  await resultRepository.create({
    runId: run.id,
    testId: 'slot-booking-flow',
    testName: 'Priority payment screen and free-slot scheduling option are reachable',
    passed: false,
    details: 'Sunday had a free slot',
  });
  await runRepository.complete('org_1', run.id, { status: 'failed' });

  const useCase = new GenerateQaAutomationReportUseCase(
    new GetQaAutomationRunUseCase(runRepository, resultRepository),
    reportRepository,
    objectStorage,
  );

  return { run, useCase, reportRepository, objectStorage };
}

describe('GenerateQaAutomationReportUseCase', () => {
  it('generates a real PDF report end to end, scoped to the given run only', async () => {
    const { run, useCase, objectStorage } = await setUp();

    const report = await useCase.execute('org_1', run.id, 'pdf');

    expect(report.runId).toBe(run.id);
    expect(report.format).toBe('pdf');
    expect(report.storageKey).toBe(`qa-automation-reports/org_1/${run.id}/pdf.pdf`);

    const buffer = await objectStorage.get(report.storageKey);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('regenerating the same format for the same run upserts rather than duplicating', async () => {
    const { run, useCase, reportRepository } = await setUp();

    const first = await useCase.execute('org_1', run.id, 'pdf');
    const second = await useCase.execute('org_1', run.id, 'pdf');

    expect(second.id).toBe(first.id);
    const all = await reportRepository.listByRun('org_1', run.id);
    expect(all).toHaveLength(1);
  });

  it('rejects a runId that does not exist', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-run', 'pdf')).rejects.toThrow(
      'QaAutomationRun not found',
    );
  });
});

describe('GetQaAutomationReportContentUseCase', () => {
  it('returns the report metadata plus the real generated PDF bytes', async () => {
    const { run, useCase, objectStorage } = await setUp();
    const report = await useCase.execute('org_1', run.id, 'pdf');

    const contentUseCase = new GetQaAutomationReportContentUseCase(
      new GetQaAutomationReportUseCase(new InMemoryQaAutomationReportRepository([report])),
      objectStorage,
    );
    const result = await contentUseCase.execute('org_1', report.id);

    expect(result.report.id).toBe(report.id);
    expect(result.content.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
