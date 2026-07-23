import { describe, expect, it } from 'vitest';
import { buildCoverageReportModel } from '../coverage-report-model.js';
import { makeCoverageFileResults, makeCoverageRun } from '../testing/fixtures.js';
import { PdfCoverageReportGenerator } from './coverage-pdf-generator.js';

describe('PdfCoverageReportGenerator', () => {
  it('produces a real, non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const model = buildCoverageReportModel(makeCoverageRun(), makeCoverageFileResults());
    const buffer = await new PdfCoverageReportGenerator().generate(model);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
