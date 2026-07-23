import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../report-model.js';
import { makeFindings, makeRepo, makeScan } from '../testing/fixtures.js';
import { SarifReportGenerator } from './sarif-generator.js';

describe('SarifReportGenerator', () => {
  it('produces a valid SARIF 2.1.0 document with one result per finding', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), makeFindings());
    const generator = new SarifReportGenerator();

    const output = await generator.generate(model);
    const sarif = JSON.parse(output);

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0];
    expect(run.tool.driver.name).toBe('CuratalIT Code Quality Platform');
    expect(run.results).toHaveLength(5);

    const criticalResult = run.results.find(
      (r: { ruleId: string }) => r.ruleId === 'slack-bot-token',
    );
    expect(criticalResult.level).toBe('error');
    expect(criticalResult.locations[0].physicalLocation.artifactLocation.uri).toBe('src/vuln.js');
    expect(criticalResult.locations[0].physicalLocation.region.startLine).toBe(6);

    const lowResult = run.results.find((r: { ruleId: string }) => r.ruleId === 'duplicate-code');
    expect(lowResult.level).toBe('note');

    const mediumResult = run.results.find((r: { ruleId: string }) => r.ruleId === 'GHSA-xxxx');
    expect(mediumResult.level).toBe('warning');
  });

  it('deduplicates rules by ruleId even with repeated occurrences', async () => {
    const findings = makeFindings();
    const model = buildReportModel(makeScan(), makeRepo(), [...findings, findings[1]!]);
    const generator = new SarifReportGenerator();

    const sarif = JSON.parse(await generator.generate(model));
    const ruleIds = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ruleIds.filter((id: string) => id === 'eval-detected')).toHaveLength(1);
    // But the duplicated finding still produces two results.
    expect(
      sarif.runs[0].results.filter((r: { ruleId: string }) => r.ruleId === 'eval-detected'),
    ).toHaveLength(2);
  });
});
