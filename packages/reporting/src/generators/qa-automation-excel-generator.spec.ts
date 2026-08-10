import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildQaAutomationReportModel } from '../qa-automation-report-model.js';
import {
  makeQaAutomationRun,
  makeQaAutomationTestResult,
  makeQaAutomationTestResults,
} from '../testing/fixtures.js';
import { ExcelQaAutomationReportGenerator } from './qa-automation-excel-generator.js';

describe('ExcelQaAutomationReportGenerator', () => {
  it('produces a real, readable workbook with a Summary sheet and a Test Results sheet', async () => {
    const model = buildQaAutomationReportModel(
      makeQaAutomationRun(),
      makeQaAutomationTestResults(),
    );
    const buffer = await new ExcelQaAutomationReportGenerator().generate(model);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);

    const summary = workbook.getWorksheet('Summary');
    expect(summary).toBeDefined();
    expect(summary!.getRow(1).getCell(1).value).toBe('Field');

    const testResults = workbook.getWorksheet('Test Results');
    expect(testResults).toBeDefined();
    expect(testResults!.getRow(1).getCell(1).value).toBe('Test ID');
    expect(testResults!.rowCount).toBeGreaterThan(1);
  });

  it('counts a skipped test as a Failed, not a Pass, in the Summary sheet, with its own Skipped breakout', async () => {
    // Per the user: a skip is stamped passed=false by the JUnit parser
    // (docs/adr/0036) — not a genuine pass.
    const results = [
      makeQaAutomationTestResult({
        id: 'r1',
        testId: 'test-pass',
        passed: true,
        details: 'Passed.',
      }),
      makeQaAutomationTestResult({
        id: 'r2',
        testId: 'test-skip',
        passed: false,
        details: 'SKIPPED: 404 in this environment',
      }),
      makeQaAutomationTestResult({
        id: 'r3',
        testId: 'test-fail',
        passed: false,
        details: 'AssertionError: nope',
      }),
    ];
    const model = buildQaAutomationReportModel(makeQaAutomationRun(), results);
    const buffer = await new ExcelQaAutomationReportGenerator().generate(model);

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const summary = workbook.getWorksheet('Summary')!;
    const summaryRows = summary
      .getSheetValues()
      .filter((row): row is ExcelJS.CellValue[] => Array.isArray(row));
    const asField = (name: string) => summaryRows.find((row) => row[1] === name)?.[2];

    expect(asField('Total')).toBe(3);
    expect(asField('Passed')).toBe(1);
    expect(asField('Failed')).toBe(2);
    expect(asField('Skipped')).toBe(1);

    const testResults = workbook.getWorksheet('Test Results')!;
    const statusCol = testResults
      .getSheetValues()
      .filter((row): row is ExcelJS.CellValue[] => Array.isArray(row))
      .find((row) => row[1] === 'test-skip')?.[3];
    expect(statusCol).toBe('Fail (skipped)');
  });

  it('groups failures by category and lists skips with their reason on the Failure & Skip Analysis sheet', async () => {
    const results = [
      makeQaAutomationTestResult({
        id: 'r1',
        testId: 'test-a',
        passed: false,
        details: 'RuntimeError: Missing credentials for newmentor: NEWMENTOR_EMAIL',
      }),
      makeQaAutomationTestResult({
        id: 'r2',
        testId: 'test-b',
        passed: false,
        details: 'RuntimeError: Missing credentials for coach: COACH_EMAIL',
      }),
      makeQaAutomationTestResult({
        id: 'r3',
        testId: 'test-c',
        passed: false,
        details: '>       raise AssertionError("boom")\nE       AssertionError: boom',
      }),
      makeQaAutomationTestResult({
        id: 'r4',
        testId: 'test-d',
        passed: false,
        details: 'SKIPPED: Hangs indefinitely',
      }),
      makeQaAutomationTestResult({
        id: 'r5',
        testId: 'test-e',
        passed: false,
        details: 'SKIPPED: 404 in this environment',
      }),
    ];
    const model = buildQaAutomationReportModel(makeQaAutomationRun(), results);
    const buffer = await new ExcelQaAutomationReportGenerator().generate(model);

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const analysis = workbook.getWorksheet('Failure & Skip Analysis');
    expect(analysis).toBeDefined();

    const values = analysis!
      .getSheetValues()
      .flat()
      .filter((v): v is string | number => v !== undefined && v !== null);

    // The two missing-credentials failures collapse into one category, count 2.
    expect(values).toContain('Missing credentials (env var mismatch)');
    expect(values).toContain(2);
    expect(values).toContain('Assertion failure (content/state mismatch)');
    // Skips are real failures now too, but must not get swept into the
    // failure-category classification (they'd land as noise in "Other").
    expect(values).not.toContain('Other / unclassified');
    expect(values).toContain('test-d');
    expect(values).toContain('Hangs indefinitely');
    expect(values).toContain('Yes'); // flagged as a possible hang
    expect(values).toContain('test-e');
    expect(values).toContain('404 in this environment');
  });
});
