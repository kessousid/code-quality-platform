import PDFDocument from 'pdfkit';
import { QA_AUTOMATION_RUN_STATUS_LABELS } from '@cqp/core';
import type { QaAutomationReportGenerator } from '../qa-automation-generator.js';
import type { QaAutomationReportModel } from '../qa-automation-report-model.js';

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
    const passed = results.filter((r) => r.passed).length;
    doc.fontSize(16).text('Summary');
    doc
      .fontSize(11)
      .text(`Total: ${results.length}  Passed: ${passed}  Failed: ${results.length - passed}`);

    doc.moveDown();
    doc.fontSize(16).text(`Test results (${results.length})`);
    doc.moveDown(0.5);

    for (const result of results) {
      doc
        .fontSize(11)
        .fillColor(result.passed ? '#000' : '#991b1b')
        .text(`[${result.passed ? 'PASS' : 'FAIL'}] ${result.testName}`, {
          underline: !result.passed,
        });
      doc
        .fontSize(9)
        .fillColor(result.passed ? '#333' : '#991b1b')
        .text(result.details);
      doc.moveDown(0.5).fillColor('#000');
    }

    doc.end();
    return done;
  }
}
