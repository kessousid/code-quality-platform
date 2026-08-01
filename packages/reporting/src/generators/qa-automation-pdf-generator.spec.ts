import { describe, expect, it } from 'vitest';
import { buildQaAutomationReportModel } from '../qa-automation-report-model.js';
import { makeQaAutomationRun, makeQaAutomationTestResults } from '../testing/fixtures.js';
import { PdfQaAutomationReportGenerator } from './qa-automation-pdf-generator.js';

describe('PdfQaAutomationReportGenerator', () => {
  it('produces a real, non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const model = buildQaAutomationReportModel(
      makeQaAutomationRun(),
      makeQaAutomationTestResults(),
    );
    const buffer = await new PdfQaAutomationReportGenerator().generate(model);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
