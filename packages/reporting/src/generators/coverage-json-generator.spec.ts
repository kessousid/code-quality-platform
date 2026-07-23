import { describe, expect, it } from 'vitest';
import { buildCoverageReportModel } from '../coverage-report-model.js';
import { makeCoverageFileResults, makeCoverageRun } from '../testing/fixtures.js';
import { JsonCoverageReportGenerator } from './coverage-json-generator.js';

describe('JsonCoverageReportGenerator', () => {
  it('produces valid JSON carrying the full model, parseable back to the same data', async () => {
    const model = buildCoverageReportModel(makeCoverageRun(), makeCoverageFileResults());
    const generator = new JsonCoverageReportGenerator();

    const output = await generator.generate(model);
    const parsed = JSON.parse(output);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.run.baseRef).toBe('main');
    expect(parsed.run.gatePassed).toBe(false);
    expect(parsed.fileResults).toHaveLength(2);
    expect(parsed.fileResults[0].filePath).toBe('src/math.ts');
  });
});
