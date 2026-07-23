import PDFDocument from 'pdfkit';
import type { UnitTestReportGenerator } from '../unit-test-generator.js';
import type { UnitTestReportModel } from '../unit-test-report-model.js';

/** Mirrors PdfReportGenerator exactly — pure JS `pdfkit`, no native binary or headless browser (docs/adr/0019, docs/adr/0024). */
export class PdfUnitTestReportGenerator implements UnitTestReportGenerator {
  readonly format = 'pdf' as const;

  async generate(model: UnitTestReportModel): Promise<Buffer> {
    const { run, generatedFiles, results, generatedAt } = model;
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(20).text('Unit Test Report', { align: 'left' });
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(
        `Target: ${run.target.path}${run.target.functionName ? ` :: ${run.target.functionName}` : ''}`,
      )
      .text(`Run: ${run.id} (${run.status})`)
      .text(`Generated: ${generatedAt.toISOString()}`)
      .fillColor('#000');

    doc.moveDown();
    doc.fontSize(16).text('Summary');
    doc
      .fontSize(11)
      .text(
        `Total: ${run.testsTotal ?? 0}  Passed: ${run.testsPassed ?? 0}  Failed: ${run.testsFailed ?? 0}`,
      );

    doc.moveDown();
    doc.fontSize(16).text(`Generated files (${generatedFiles.length})`);
    doc.fontSize(10);
    for (const file of generatedFiles) {
      doc.text(`  ${file.sourceFilePath} -> ${file.testFilePath}`);
    }

    doc.moveDown();
    doc.fontSize(16).text(`Test results (${results.length})`);
    doc.moveDown(0.5);

    for (const result of results) {
      doc
        .fontSize(11)
        .fillColor(result.status === 'failed' ? '#991b1b' : '#000')
        .text(`[${result.status.toUpperCase()}] ${result.testName}`, {
          underline: result.status === 'failed',
        });
      doc
        .fontSize(9)
        .fillColor('#333')
        .text(
          `${result.testFilePath}${result.durationMs !== undefined ? ` (${result.durationMs}ms)` : ''}`,
        );
      if (result.failureMessage) {
        doc.fillColor('#991b1b').text(result.failureMessage);
      }
      doc.moveDown(0.5).fillColor('#000');
    }

    doc.end();
    return done;
  }
}
