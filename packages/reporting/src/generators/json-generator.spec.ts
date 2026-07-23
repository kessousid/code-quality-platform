import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../report-model.js';
import { makeFindings, makeRepo, makeScan } from '../testing/fixtures.js';
import { JsonReportGenerator } from './json-generator.js';

describe('JsonReportGenerator', () => {
  it('produces valid JSON carrying the full model, parseable back to the same data', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), makeFindings());
    const generator = new JsonReportGenerator();

    const output = await generator.generate(model);
    const parsed = JSON.parse(output);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.summary.healthScore).toBe(model.summary.healthScore);
    expect(parsed.findings).toHaveLength(5);
    expect(parsed.findings[0].id).toBe('f1');
    expect(parsed.repo.name).toBe('sample-repo');
  });
});
