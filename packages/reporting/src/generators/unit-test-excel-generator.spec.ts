import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildUnitTestReportModel } from '../unit-test-report-model.js';
import { makeGeneratedTestFile, makeTestCaseResult, makeUnitTestRun } from '../testing/fixtures.js';
import { ExcelUnitTestReportGenerator } from './unit-test-excel-generator.js';

/** Real exceljs round trip (project convention: no mocking) — the buffer is read back with exceljs's own loader, not just pattern-matched as bytes. */
describe('ExcelUnitTestReportGenerator', () => {
  it('produces a real, readable workbook with a Summary sheet and a Test Results sheet', async () => {
    const results = [
      makeTestCaseResult({ id: 't1', testName: 'adds two numbers', status: 'passed' }),
      makeTestCaseResult({
        id: 't2',
        testName: 'fails on purpose',
        status: 'failed',
        failureMessage: 'Expected 3 but received 2',
      }),
      makeTestCaseResult({ id: 't3', testName: 'not yet implemented', status: 'skipped' }),
    ];
    const model = buildUnitTestReportModel(
      makeUnitTestRun({ testsTotal: 3, testsPassed: 1, testsFailed: 1 }),
      [makeGeneratedTestFile()],
      results,
    );

    const buffer = await new ExcelUnitTestReportGenerator().generate(model);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    // exceljs's own .d.ts predates @types/node's generic Buffer<T> — same
    // real Buffer at runtime, just an ambient-type version clash between
    // this workspace's @types/node and exceljs's own bundled one, which no
    // cast to a named type resolves (the check re-applies at the call site
    // against exceljs's own declared parameter type either way).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);

    const summary = workbook.getWorksheet('Summary');
    expect(summary).toBeDefined();
    const summaryValues = summary!
      .getSheetValues()
      .filter((row): row is ExcelJS.CellValue[] => Array.isArray(row))
      .map((row) => row.slice(1));
    expect(summaryValues).toContainEqual(['Run ID', 'run_1']);
    expect(summaryValues).toContainEqual(['Total', 3]);
    expect(summaryValues).toContainEqual(['Passed', 1]);
    expect(summaryValues).toContainEqual(['Failed', 1]);

    const testResults = workbook.getWorksheet('Test Results');
    expect(testResults).toBeDefined();
    expect(testResults!.rowCount).toBe(4); // header + 3 results

    // A real reload from bytes has no knowledge of the original in-memory
    // column keys (XLSX itself doesn't store them) — position only:
    // 1=Test File, 2=Test Name, 3=Status, 4=Duration, 5=Reason.
    const passRow = findRowByTestName(testResults!, 'adds two numbers');
    expect(passRow.getCell(3).value).toBe('Pass');
    expect(passRow.getCell(5).value).toBeFalsy();

    const failRow = findRowByTestName(testResults!, 'fails on purpose');
    expect(failRow.getCell(3).value).toBe('Fail');
    expect(failRow.getCell(5).value).toBe('Expected 3 but received 2');

    const skippedRow = findRowByTestName(testResults!, 'not yet implemented');
    expect(skippedRow.getCell(3).value).toBe('No run');
  });
});

function findRowByTestName(sheet: ExcelJS.Worksheet, testName: string): ExcelJS.Row {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.getCell(2).value === testName) {
      found = row;
    }
  });
  if (!found) throw new Error(`No row found for test name "${testName}"`);
  return found;
}
