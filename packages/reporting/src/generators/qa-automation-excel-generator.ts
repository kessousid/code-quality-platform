import ExcelJS from 'exceljs';
import type { QaAutomationReportGenerator } from '../qa-automation-generator.js';
import type { QaAutomationReportModel } from '../qa-automation-report-model.js';

/** Mirrors ExcelUnitTestReportGenerator exactly, for QaAutomationRun instead of UnitTestRun. */
export class ExcelQaAutomationReportGenerator implements QaAutomationReportGenerator {
  readonly format = 'xlsx' as const;

  async generate(model: QaAutomationReportModel): Promise<Buffer> {
    const { run, results, generatedAt } = model;
    const workbook = new ExcelJS.Workbook();
    workbook.created = generatedAt;

    const passed = results.filter((r) => r.passed).length;

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 20 },
      { header: 'Value', key: 'value', width: 50 },
    ];
    summary.addRows([
      { field: 'Run ID', value: run.id },
      { field: 'Status', value: run.status },
      { field: 'Triggered By', value: run.triggeredBy },
      { field: 'Started', value: run.startedAt.toISOString() },
      {
        field: 'Completed',
        value: run.completedAt ? run.completedAt.toISOString() : '(in progress)',
      },
      { field: 'Total', value: results.length },
      { field: 'Passed', value: passed },
      { field: 'Failed', value: results.length - passed },
      { field: 'Generated At', value: generatedAt.toISOString() },
    ]);
    summary.getRow(1).font = { bold: true };

    const testResults = workbook.addWorksheet('Test Results');
    testResults.columns = [
      { header: 'Test ID', key: 'testId', width: 30 },
      { header: 'Test Name', key: 'testName', width: 50 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Details', key: 'details', width: 80 },
    ];
    testResults.addRows(
      results.map((result) => ({
        testId: result.testId,
        testName: result.testName,
        status: result.passed ? 'Pass' : 'Fail',
        details: result.details,
      })),
    );
    testResults.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
