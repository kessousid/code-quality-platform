import { describe, expect, it } from 'vitest';
import { buildUnitTestReportModel } from '../unit-test-report-model.js';
import {
  makeGeneratedTestFile,
  makeTestCaseResult,
  makeTestCaseResults,
  makeUnitTestRun,
} from '../testing/fixtures.js';
import { HtmlUnitTestReportGenerator } from './unit-test-html-generator.js';

describe('HtmlUnitTestReportGenerator', () => {
  it('produces a single self-contained HTML document with no external script/link tags', async () => {
    const model = buildUnitTestReportModel(
      makeUnitTestRun(),
      [makeGeneratedTestFile()],
      makeTestCaseResults(),
    );
    const html = await new HtmlUnitTestReportGenerator().generate(model);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('src/math.ts');
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/<link/);
    for (const result of model.results) {
      expect(html).toContain(result.testName);
    }
  });

  it('escapes HTML in a failure message instead of injecting it raw', async () => {
    const malicious = makeTestCaseResult({
      id: 't_xss',
      status: 'failed',
      failureMessage: '<script>alert(1)</script> "quoted"',
    });
    const model = buildUnitTestReportModel(makeUnitTestRun(), [], [malicious]);
    const html = await new HtmlUnitTestReportGenerator().generate(model);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('shows the target function name when the run narrowed to one', async () => {
    const model = buildUnitTestReportModel(
      makeUnitTestRun({ target: { path: 'src/math.ts', functionName: 'add' } }),
      [],
      [],
    );
    const html = await new HtmlUnitTestReportGenerator().generate(model);
    expect(html).toContain('<strong>src/math.ts</strong> :: add');
  });
});
