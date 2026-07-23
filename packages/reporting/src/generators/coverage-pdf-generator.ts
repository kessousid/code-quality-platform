import PDFDocument from 'pdfkit';
import type { CoverageReportGenerator } from '../coverage-generator.js';
import type { CoverageReportModel } from '../coverage-report-model.js';

/** Mirrors PdfUnitTestReportGenerator exactly — pure JS `pdfkit`, no native binary or headless browser (docs/adr/0019, docs/adr/0024, docs/adr/0025). */
export class PdfCoverageReportGenerator implements CoverageReportGenerator {
  readonly format = 'pdf' as const;

  async generate(model: CoverageReportModel): Promise<Buffer> {
    const { run, fileResults, generatedAt } = model;
    const gatePassed = run.gatePassed ?? false;
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(20).text('Coverage Gate Report', { align: 'left' });
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Base ref: ${run.baseRef}`)
      .text(`Run: ${run.id} (${run.status})`)
      .text(`Generated: ${generatedAt.toISOString()}`)
      .fillColor('#000');

    doc.moveDown();
    doc
      .fontSize(14)
      .fillColor(gatePassed ? '#166534' : '#991b1b')
      .text(
        gatePassed
          ? 'Gate passed — every changed line is covered and all tests pass.'
          : `Gate failed — ${run.uncoveredLinesTotal ?? 0} of ${run.changedLinesTotal ?? 0} changed line(s) uncovered.`,
      )
      .fillColor('#000');

    doc.moveDown();
    doc.fontSize(16).text('Summary');
    doc
      .fontSize(11)
      .text(
        `Tests: ${run.testsTotal ?? 0} total, ${run.testsPassed ?? 0} passed, ${run.testsFailed ?? 0} failed`,
      )
      .text(
        `Lines: ${run.changedLinesTotal ?? 0} changed, ${run.uncoveredLinesTotal ?? 0} uncovered`,
      );

    doc.moveDown();
    doc.fontSize(16).text(`Changed files (${fileResults.length})`);
    doc.moveDown(0.5);

    for (const file of fileResults) {
      doc
        .fontSize(11)
        .fillColor(file.status === 'uncovered' ? '#991b1b' : '#000')
        .text(`[${file.status.toUpperCase()}] ${file.filePath}`, {
          underline: file.status === 'uncovered',
        });
      doc
        .fontSize(9)
        .fillColor('#333')
        .text(
          file.uncoveredLines.length > 0
            ? `Uncovered lines: ${file.uncoveredLines.join(', ')}`
            : 'Every changed line is covered.',
        );
      doc.moveDown(0.5).fillColor('#000');
    }

    doc.end();
    return done;
  }
}
