import ExcelJS from 'exceljs';
import type { TestCaseResult } from '@cqp/core';
import type { UnitTestReportGenerator } from '../unit-test-generator.js';
import type { UnitTestReportModel } from '../unit-test-report-model.js';

const STATUS_LABEL: Record<TestCaseResult['status'], string> = {
  passed: 'Pass',
  failed: 'Fail',
  skipped: 'No run',
};

/** Mirrors PdfUnitTestReportGenerator's data coverage, spreadsheet-shaped (docs/adr/0034) — no native binary or headless browser, same as pdfkit. */
export class ExcelUnitTestReportGenerator implements UnitTestReportGenerator {
  readonly format = 'xlsx' as const;

  async generate(model: UnitTestReportModel): Promise<Buffer> {
    const { run, results, generatedAt } = model;
    const workbook = new ExcelJS.Workbook();
    workbook.created = generatedAt;

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Value', key: 'value', width: 50 },
    ];
    summary.addRows([
      { field: 'Run ID', value: run.id },
      {
        field: 'Target',
        value: run.target.functionName
          ? `${run.target.path} :: ${run.target.functionName}`
          : run.target.path,
      },
      { field: 'Status', value: run.status },
      { field: 'Total', value: run.testsTotal ?? 0 },
      { field: 'Passed', value: run.testsPassed ?? 0 },
      { field: 'Failed', value: run.testsFailed ?? 0 },
      { field: 'Generated At', value: generatedAt.toISOString() },
    ]);
    summary.getRow(1).font = { bold: true };

    const testResults = workbook.addWorksheet('Test Results');
    testResults.columns = [
      { header: 'Test File', key: 'testFile', width: 40 },
      { header: 'Test Name', key: 'testName', width: 40 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Duration (ms)', key: 'durationMs', width: 14 },
      { header: 'Reason', key: 'reason', width: 60 },
    ];
    testResults.addRows(
      results.map((result) => ({
        testFile: result.testFilePath,
        testName: result.testName,
        status: STATUS_LABEL[result.status],
        durationMs: result.durationMs ?? '',
        reason: result.status === 'failed' ? (result.failureMessage ?? '') : '',
      })),
    );
    testResults.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
