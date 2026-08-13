import PDFDocument from 'pdfkit';
import { QA_AUTOMATION_RUN_STATUS_LABELS } from '@cqp/core';
import type { QaAutomationReportGenerator } from '../qa-automation-generator.js';
import type { QaAutomationReportModel } from '../qa-automation-report-model.js';
import { isSkipped } from '../qa-automation-failure-classifier.js';

/** Mirrors PdfUnitTestReportGenerator exactly — pure JS `pdfkit`, no native binary or headless browser. */
export class PdfQaAutomationReportGenerator implements QaAutomationReportGenerator {
  readonly format = 'pdf' as const;

  async generate(model: QaAutomationReportModel): Promise<Buffer> {
    const { run, results, generatedAt } = model;
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(20).text('Production QA Automation Report', { align: 'left' });
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Run: ${run.id} (${QA_AUTOMATION_RUN_STATUS_LABELS[run.status]})`)
      .text(`Triggered by: ${run.triggeredBy}`)
      .text(`Started: ${run.startedAt.toISOString()}`)
      .text(`Completed: ${run.completedAt ? run.completedAt.toISOString() : '(in progress)'}`)
      .text(`Generated: ${generatedAt.toISOString()}`)
      .fillColor('#000');

    doc.moveDown();
    // A pytest skip is stamped passed=false by the JUnit parser, but it's
    // a real third outcome, not a genuine failure — split it out of
    // `failed` here too (see @cqp/reporting's ExcelQaAutomationReportGenerator).
    const passed = results.filter((r) => r.passed).length;
    const skipped = results.filter((r) => !r.passed && isSkipped(r.details)).length;
    const failed = results.length - passed - skipped;
    doc.fontSize(16).text('Summary');
    doc
      .fontSize(11)
      .text(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);

    doc.moveDown();
    doc.fontSize(16).text(`Test results (${results.length})`);
    doc.moveDown(0.5);

    for (const result of results) {
      const skip = !result.passed && isSkipped(result.details);
      const label = result.passed ? 'PASS' : skip ? 'SKIP' : 'FAIL';
      const color = result.passed ? '#000' : skip ? '#92400e' : '#991b1b';
      doc.fontSize(11).fillColor(color).text(`[${label}] ${result.testName}`, {
        underline: !result.passed,
      });
      doc.fontSize(9).fillColor(color).text(result.details);
      // Only ever set for a staging run — production has only ever had one source.
      if (result.sourceUrl !== undefined) {
        doc.fontSize(8).fillColor('#2563eb').text(`Source: ${result.sourceUrl}`);
      }
      doc.moveDown(0.5).fillColor('#000');
    }

    doc.end();
    return done;
  }
}
