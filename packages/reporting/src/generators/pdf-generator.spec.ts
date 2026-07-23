import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../report-model.js';
import { makeFinding, makeFindings, makeRepo, makeScan } from '../testing/fixtures.js';
import { PdfReportGenerator } from './pdf-generator.js';

describe('PdfReportGenerator', () => {
  it('produces a real PDF document (valid header, non-trivial size, valid EOF marker)', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), makeFindings());
    const generator = new PdfReportGenerator();

    const buffer = await generator.generate(model);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(-6).toString('ascii').trim()).toBe('%%EOF');
  });

  it('handles an empty findings list without throwing', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), []);
    const generator = new PdfReportGenerator();

    const buffer = await generator.generate(model);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders a real, larger PDF when a finding carries automated-analysis text', async () => {
    const plain = buildReportModel(makeScan(), makeRepo(), [makeFinding({ id: 'f1' })]);
    const enriched = buildReportModel(makeScan(), makeRepo(), [
      makeFinding({
        id: 'f1',
        ai: {
          plainEnglishExplanation: 'A'.repeat(200),
          businessImpact: 'B'.repeat(200),
          relatedFindingIds: [],
        },
      }),
    ]);
    const generator = new PdfReportGenerator();

    const plainBuffer = await generator.generate(plain);
    const enrichedBuffer = await generator.generate(enriched);

    expect(enrichedBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // Real evidence the extra text was actually written into the document,
    // not just accepted without error.
    expect(enrichedBuffer.length).toBeGreaterThan(plainBuffer.length);
  });
});
