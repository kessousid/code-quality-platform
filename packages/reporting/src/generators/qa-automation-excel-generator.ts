import ExcelJS from 'exceljs';
import {
  isQuarantinedTestResult,
  QA_AUTOMATION_RUN_STATUS_LABELS,
  type QaAutomationTestResult,
} from '@cqp/core';
import type { QaAutomationReportGenerator } from '../qa-automation-generator.js';
import type { QaAutomationReportModel } from '../qa-automation-report-model.js';
import {
  classifyFailureReason,
  isPossibleHang,
  isSkipped,
  skipReason,
} from '../qa-automation-failure-classifier.js';

const RED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4E4' },
};
const ORANGE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFE8CC' },
};
const GRAY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEFEFEF' },
};
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E78' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };

/**
 * The first "E   <Error/Exception>:" line of a pytest traceback, or the
 * last non-empty line as a fallback — a full traceback dump doesn't scale
 * across hundreds of rows, but the one line that actually says what broke
 * does. Mirrors the extraction the user already found valuable in a
 * manually-built version of this report before it was made automatic.
 */
function extractFailureReason(details: string): string {
  const lines = details.split('\n');
  const namedError = lines.find(
    (line) => /^E\s/.test(line.trim()) && /[A-Za-z]+(Error|Exception):/.test(line),
  );
  if (namedError) return namedError.trim().replace(/^E\s+/, '');
  const anyE = lines.find((line) => /^E\s/.test(line.trim()));
  if (anyE) return anyE.trim().replace(/^E\s+/, '');
  const lastNonEmpty = [...lines].reverse().find((line) => line.trim().length > 0);
  return (lastNonEmpty ?? details).trim().slice(0, 300);
}

/** Best-effort grouping from the test's own name — for scanability across a large report, not a precise taxonomy. */
function categorizeArea(testName: string): string {
  const n = testName.toUpperCase();
  if (n.includes('PANELADMIN')) return 'Panel Admin';
  if (n.includes('_SA_') || n.includes('SCHEDULING')) return 'Scheduling Admin';
  if (n.includes('_MTR_') || n.includes('MENTOR')) return 'Mentor';
  if (n.includes('_MR_') || n.includes('COD') || n.includes('MASTER_RECRUITER')) {
    return 'Master Recruiter / COD';
  }
  if (n.includes('_ADMIN_') || n.startsWith('TEST_ADMIN')) return 'Admin';
  if (n.includes('CANDSEARCH')) return 'Candidate Search';
  if (n.includes('RBAC')) return 'RBAC / Access Control';
  if (n.includes('CANDIDATE')) return 'Candidate';
  return 'Other';
}

/** Mirrors ExcelUnitTestReportGenerator exactly, for QaAutomationRun instead of UnitTestRun. */
export class ExcelQaAutomationReportGenerator implements QaAutomationReportGenerator {
  readonly format = 'xlsx' as const;

  async generate(model: QaAutomationReportModel): Promise<Buffer> {
    const { run, results, generatedAt } = model;
    const workbook = new ExcelJS.Workbook();
    workbook.created = generatedAt;

    // A pytest skip is stamped passed=false by the JUnit parser, but it's
    // a real third outcome, not a genuine failure — split it out of
    // `failed` here too, matching the per-row Status column below and the
    // Failure & Skip Analysis sheet, which already treat it separately.
    // "Skipped" here means a real self-skip only — a quarantined stub
    // (deselected before it even ran, docs/adr/0055/0056) is its own,
    // further-separated bucket (see the Quarantined sheet).
    const quarantinedCount = results.filter((r) => isQuarantinedTestResult(r.details)).length;
    const skipped = results.filter(
      (r) => isSkipped(r.details) && !isQuarantinedTestResult(r.details),
    ).length;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed - skipped - quarantinedCount;

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Value', key: 'value', width: 50 },
    ];
    summary.addRows([
      { field: 'Run ID', value: run.id },
      { field: 'Status', value: QA_AUTOMATION_RUN_STATUS_LABELS[run.status] },
      { field: 'Triggered By', value: run.triggeredBy },
      { field: 'Started', value: run.startedAt.toISOString() },
      {
        field: 'Completed',
        value: run.completedAt ? run.completedAt.toISOString() : '(in progress)',
      },
      { field: 'Total', value: results.length },
      { field: 'Passed', value: passed },
      { field: 'Failed', value: failed },
      { field: 'Skipped', value: skipped },
      { field: 'Quarantined', value: quarantinedCount },
      { field: 'Generated At', value: generatedAt.toISOString() },
    ]);
    summary.getRow(1).font = { bold: true };

    const testResults = workbook.addWorksheet('Test Results');
    testResults.columns = [
      { header: 'Test ID', key: 'testId', width: 30 },
      { header: 'Test Name', key: 'testName', width: 50 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Details', key: 'details', width: 80 },
      // Only ever populated for a staging run. Blank for production, which has just the one source.
      { header: 'Source', key: 'sourceUrl', width: 60 },
    ];
    testResults.addRows(
      results.map((result) => ({
        testId: result.testId,
        testName: result.testName,
        status: result.passed ? 'Pass' : isSkipped(result.details) ? 'Skipped' : 'Fail',
        details: result.details,
        sourceUrl: result.sourceUrl ?? '',
      })),
    );
    testResults.getRow(1).font = { bold: true };

    this.addAnalysisSheet(workbook, results);
    this.addFailedSheet(workbook, results);
    this.addSkippedSheet(workbook, results);
    this.addQuarantinedSheet(workbook, results);
    this.addLegendSheet(workbook);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private styleHeaderRow(row: ExcelJS.Row): void {
    row.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
  }

  /**
   * Real, unexpected failures only — a pytest skip and a quarantined stub
   * are both excluded, they get their own sheets below. Per the user:
   * a per-test raw traceback dump doesn't scale, so this shows the one
   * extracted line that actually says what broke, not the full trace
   * (still available on the Test Results sheet for anyone who needs it).
   */
  private addFailedSheet(workbook: ExcelJS.Workbook, results: QaAutomationTestResult[]): void {
    const sheet = workbook.addWorksheet('Failed');
    sheet.columns = [
      { header: 'Test Name', key: 'testName', width: 55 },
      { header: 'Area', key: 'area', width: 22 },
      { header: 'Reason / Error', key: 'reason', width: 90 },
    ];
    this.styleHeaderRow(sheet.getRow(1));

    const failures = results.filter(
      (r) => !r.passed && !isSkipped(r.details) && !isQuarantinedTestResult(r.details),
    );
    for (const result of failures) {
      const row = sheet.addRow({
        testName: result.testName,
        area: categorizeArea(result.testName),
        reason: extractFailureReason(result.details),
      });
      row.eachCell((cell) => (cell.fill = RED_FILL));
    }
  }

  /** Self-skips only (data/env gaps, missing creds) — a quarantined stub belongs on the Quarantined sheet instead. */
  private addSkippedSheet(workbook: ExcelJS.Workbook, results: QaAutomationTestResult[]): void {
    const sheet = workbook.addWorksheet('Skipped');
    sheet.columns = [
      { header: 'Test Name', key: 'testName', width: 55 },
      { header: 'Area', key: 'area', width: 22 },
      { header: 'Skip Reason', key: 'reason', width: 90 },
    ];
    this.styleHeaderRow(sheet.getRow(1));

    const skips = results.filter(
      (r) => isSkipped(r.details) && !isQuarantinedTestResult(r.details),
    );
    for (const result of skips) {
      const row = sheet.addRow({
        testName: result.testName,
        area: categorizeArea(result.testName),
        reason: skipReason(result.details),
      });
      if (isPossibleHang(result.details)) {
        row.eachCell((cell) => (cell.fill = ORANGE_FILL));
      }
    }
  }

  /** Known hangs deselected before this run even started (docs/adr/0055, docs/adr/0056) — never executed at all. */
  private addQuarantinedSheet(workbook: ExcelJS.Workbook, results: QaAutomationTestResult[]): void {
    const sheet = workbook.addWorksheet('Quarantined');
    sheet.columns = [
      { header: 'Test Name', key: 'testName', width: 55 },
      { header: 'Area', key: 'area', width: 22 },
      { header: 'Reason', key: 'reason', width: 90 },
    ];
    this.styleHeaderRow(sheet.getRow(1));

    const quarantined = results.filter((r) => isQuarantinedTestResult(r.details));
    for (const result of quarantined) {
      const row = sheet.addRow({
        testName: result.testName,
        area: categorizeArea(result.testName),
        reason: skipReason(result.details),
      });
      row.eachCell((cell) => (cell.fill = GRAY_FILL));
    }
  }

  private addLegendSheet(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet('Legend');
    sheet.columns = [
      { header: 'Sheet / Color', key: 'label', width: 28 },
      { header: 'Meaning', key: 'meaning', width: 95 },
    ];
    this.styleHeaderRow(sheet.getRow(1));
    sheet.addRows([
      { label: 'Failed (red)', meaning: 'A real failure -- not expected, needs triage.' },
      {
        label: 'Skipped',
        meaning:
          'Self-skipped by the test itself -- a data/environment gap or a missing credential, not a code bug.',
      },
      {
        label: 'Skipped (orange)',
        meaning:
          'Self-reports a hang -- worth flagging back to the suite maintainer for quarantine.',
      },
      {
        label: 'Quarantined (gray)',
        meaning:
          'Deselected before the run even started -- a known hang, not executed at all (docs/adr/0055, docs/adr/0056).',
      },
    ]);
  }

  /**
   * Per the user: a per-run raw list of failures/skips doesn't scale —
   * confirmed live on a real 152-failure staging run, which only became
   * actionable once grouped into ~6 real root causes instead of read one
   * traceback at a time. This sheet is that grouping, generated fresh
   * every run rather than a one-off manual analysis.
   */
  private addAnalysisSheet(workbook: ExcelJS.Workbook, results: QaAutomationTestResult[]): void {
    const analysis = workbook.addWorksheet('Failure & Skip Analysis');

    // Skips are also passed=false now (per the user), but a "SKIPPED: ..."
    // string isn't a real traceback — classifying it here would just add
    // noise to "Other / unclassified" instead of the dedicated section below.
    const failures = results.filter((r) => !r.passed && !isSkipped(r.details));
    const failureCounts = new Map<string, { count: number; example: string }>();
    for (const result of failures) {
      const category = classifyFailureReason(result.details);
      const existing = failureCounts.get(category);
      if (existing) existing.count += 1;
      else failureCounts.set(category, { count: 1, example: result.testId });
    }

    analysis.addRow(['Failures by category']).font = { bold: true };
    analysis.addRow(['Category', 'Count', 'Example Test ID']).font = { bold: true };
    for (const [category, { count, example }] of [...failureCounts.entries()].sort(
      (a, b) => b[1].count - a[1].count,
    )) {
      analysis.addRow([category, count, example]);
    }
    analysis.addRow([]);

    const skips = results.filter((r) => isSkipped(r.details));
    analysis.addRow(['Skipped tests']).font = { bold: true };
    analysis.addRow(['Test ID', 'Reason', 'Possible hang? (report to suite maintainer)']).font = {
      bold: true,
    };
    for (const result of skips) {
      analysis.addRow([
        result.testId,
        skipReason(result.details),
        isPossibleHang(result.details) ? 'Yes' : '',
      ]);
    }

    analysis.getColumn(1).width = 45;
    analysis.getColumn(2).width = 60;
    analysis.getColumn(3).width = 30;
  }
}
