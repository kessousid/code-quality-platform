import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildQaAutomationReportModel } from '../qa-automation-report-model.js';
import { makeQaAutomationRun, makeQaAutomationTestResults } from '../testing/fixtures.js';
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
});
