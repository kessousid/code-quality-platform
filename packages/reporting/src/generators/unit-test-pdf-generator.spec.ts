import { describe, expect, it } from 'vitest';
import { buildUnitTestReportModel } from '../unit-test-report-model.js';
import {
  makeGeneratedTestFile,
  makeTestCaseResults,
  makeUnitTestRun,
} from '../testing/fixtures.js';
import { PdfUnitTestReportGenerator } from './unit-test-pdf-generator.js';

describe('PdfUnitTestReportGenerator', () => {
  it('produces a real, non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const model = buildUnitTestReportModel(
      makeUnitTestRun(),
      [makeGeneratedTestFile()],
      makeTestCaseResults(),
    );
    const buffer = await new PdfUnitTestReportGenerator().generate(model);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
