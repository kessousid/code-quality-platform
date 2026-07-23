import PDFDocument from 'pdfkit';
import type { Severity } from '@cqp/core';
import type { ReportGenerator } from '../generator.js';
import type { ReportModel } from '../report-model.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * `pdfkit` — pure JS, renders in-process, no native binary or headless
 * browser (see docs/adr/0019 for why that mattered after Phase 7's
 * Windows binary-resolution pain). Structural content only, no attempt
 * at matching the HTML report's visual design pixel-for-pixel.
 */
export class PdfReportGenerator implements ReportGenerator {
  readonly format = 'pdf' as const;

  async generate(model: ReportModel): Promise<Buffer> {
    const { scan, repo, summary, findings, generatedAt } = model;
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(20).text('Code Quality & Security Report', { align: 'left' });
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Repo: ${repo.name}`)
      .text(`Scan: ${scan.id} (${scan.ref}, ${scan.mode})`)
      .text(`Generated: ${generatedAt.toISOString()}`)
      .fillColor('#000');

    doc.moveDown();
    doc.fontSize(16).text('Executive summary');
    doc.fontSize(28).text(`${summary.healthScore} / 100`, { continued: false });
    doc
      .fontSize(11)
      .text(`${summary.totalFindings} total findings, ${summary.openFindings} currently open.`);

    doc.moveDown(0.5);
    for (const severity of SEVERITY_ORDER) {
      doc.text(`  ${severity}: ${summary.bySeverity[severity]}`);
    }

    doc.moveDown();
    doc.fontSize(16).text(`Developer detail (${findings.length} findings)`);
    doc.moveDown(0.5);

    const sorted = [...findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    for (const finding of sorted) {
      doc
        .fontSize(12)
        .fillColor('#000')
        .text(`[${finding.severity.toUpperCase()}] ${finding.title}`, { underline: true });
      doc
        .fontSize(9)
        .fillColor('#333')
        .text(`${finding.source}/${finding.ruleId}`)
        .text(`Root cause: ${finding.rootCause}`)
        .text(`Recommended fix: ${finding.recommendedFix}`);
      for (const location of finding.locations) {
        doc.text(`  - ${location.filePath}:${location.startLine}`);
      }
      // Rule-based, not an LLM — see docs/adr/0020.
      if (finding.ai) {
        doc
          .fillColor('#6d28d9')
          .text('Automated analysis:', { continued: false })
          .fillColor('#333')
          .text(finding.ai.plainEnglishExplanation)
          .text(`Business impact: ${finding.ai.businessImpact}`);
      }
      doc.moveDown(0.5).fillColor('#000');
    }

    doc.end();
    return done;
  }
}
