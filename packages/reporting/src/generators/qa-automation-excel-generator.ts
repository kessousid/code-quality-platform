import ExcelJS from 'exceljs';
import { QA_AUTOMATION_RUN_STATUS_LABELS, type QaAutomationTestResult } from '@cqp/core';
import type { QaAutomationReportGenerator } from '../qa-automation-generator.js';
import type { QaAutomationReportModel } from '../qa-automation-report-model.js';
import {
  classifyFailureReason,
  isPossibleHang,
  isSkipped,
  skipReason,
} from '../qa-automation-failure-classifier.js';

/** Mirrors ExcelUnitTestReportGenerator exactly, for QaAutomationRun instead of UnitTestRun. */
export class ExcelQaAutomationReportGenerator implements QaAutomationReportGenerator {
  readonly format = 'xlsx' as const;

  async generate(model: QaAutomationReportModel): Promise<Buffer> {
    const { run, results, generatedAt } = model;
    const workbook = new ExcelJS.Workbook();
    workbook.created = generatedAt;

    // A pytest skip is stamped passed=true (docs/adr/0036) so it never
    // triggers a false failure alert — but it isn't a genuine pass either,
    // so it must come out of "Passed" here or the two counts would double
    // up the same rows.
    const skipped = results.filter((r) => isSkipped(r.details)).length;
    const failed = results.filter((r) => !r.passed).length;
    const passed = results.length - failed - skipped;

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
        status: !result.passed ? 'Fail' : isSkipped(result.details) ? 'Skip' : 'Pass',
        details: result.details,
        sourceUrl: result.sourceUrl ?? '',
      })),
    );
    testResults.getRow(1).font = { bold: true };

    this.addAnalysisSheet(workbook, results);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
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

    const failures = results.filter((r) => !r.passed);
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
