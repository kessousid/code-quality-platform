import { describe, expect, it } from 'vitest';
import { buildCoverageReportModel } from '../coverage-report-model.js';
import {
  makeCoverageFileResult,
  makeCoverageFileResults,
  makeCoverageRun,
} from '../testing/fixtures.js';
import { HtmlCoverageReportGenerator } from './coverage-html-generator.js';

describe('HtmlCoverageReportGenerator', () => {
  it('produces a single self-contained HTML document with no external script/link tags', async () => {
    const model = buildCoverageReportModel(makeCoverageRun(), makeCoverageFileResults());
    const html = await new HtmlCoverageReportGenerator().generate(model);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('src/math.ts');
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/<link/);
    for (const file of model.fileResults) {
      expect(html).toContain(file.filePath);
    }
  });

  it('shows a failed gate verdict banner with the uncovered line count', async () => {
    const model = buildCoverageReportModel(
      makeCoverageRun({ gatePassed: false, changedLinesTotal: 3, uncoveredLinesTotal: 1 }),
      makeCoverageFileResults(),
    );
    const html = await new HtmlCoverageReportGenerator().generate(model);

    expect(html).toContain('Gate failed');
    expect(html).toContain('1 of 3 changed line(s) uncovered');
  });

  it('shows a passed gate verdict banner when there are zero uncovered lines', async () => {
    const model = buildCoverageReportModel(
      makeCoverageRun({
        gatePassed: true,
        changedLinesTotal: 3,
        uncoveredLinesTotal: 0,
        testsFailed: 0,
      }),
      [makeCoverageFileResult({ id: 'cf1', status: 'covered', uncoveredLines: [] })],
    );
    const html = await new HtmlCoverageReportGenerator().generate(model);

    expect(html).toContain('Gate passed');
  });

  it('escapes HTML in a file path instead of injecting it raw', async () => {
    const malicious = makeCoverageFileResult({
      id: 'cf_xss',
      filePath: '<script>alert(1)</script>.ts',
    });
    const model = buildCoverageReportModel(makeCoverageRun(), [malicious]);
    const html = await new HtmlCoverageReportGenerator().generate(model);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
