import { describe, expect, it } from 'vitest';
import { buildUnitTestReportModel } from '../unit-test-report-model.js';
import {
  makeGeneratedTestFile,
  makeTestCaseResults,
  makeUnitTestRun,
} from '../testing/fixtures.js';
import { JsonUnitTestReportGenerator } from './unit-test-json-generator.js';

describe('JsonUnitTestReportGenerator', () => {
  it('produces valid JSON carrying the full model, parseable back to the same data', async () => {
    const model = buildUnitTestReportModel(
      makeUnitTestRun(),
      [makeGeneratedTestFile()],
      makeTestCaseResults(),
    );
    const generator = new JsonUnitTestReportGenerator();

    const output = await generator.generate(model);
    const parsed = JSON.parse(output);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.run.target.path).toBe('src/math.ts');
    expect(parsed.results).toHaveLength(2);
    expect(parsed.generatedFiles[0].testFilePath).toBe('src/math.generated.test.ts');
  });
});
