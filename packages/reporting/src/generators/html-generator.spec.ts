import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../report-model.js';
import { makeFinding, makeFindings, makeRepo, makeScan } from '../testing/fixtures.js';
import { HtmlReportGenerator } from './html-generator.js';

describe('HtmlReportGenerator', () => {
  it('produces a single self-contained HTML document with no external script/link tags', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), makeFindings());
    const generator = new HtmlReportGenerator();

    const html = await generator.generate(model);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('sample-repo');
    expect(html).toContain(`${model.summary.healthScore} / 100`);
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/<link/);
    // Every finding's title appears somewhere in the document.
    for (const finding of model.findings) {
      expect(html).toContain(finding.title);
    }
  });

  it('escapes HTML in finding content instead of injecting it raw', async () => {
    const malicious = makeFinding({
      id: 'f_xss',
      title: '<script>alert(1)</script>',
      rootCause: 'Contains "quotes" & <tags>',
    });
    const model = buildReportModel(makeScan(), makeRepo(), [malicious]);
    const generator = new HtmlReportGenerator();

    const html = await generator.generate(model);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quotes&quot;');
  });

  it('renders an "Automated analysis" panel (never "AI") when a finding carries enrichment', async () => {
    const enriched = makeFinding({
      id: 'f_ai',
      ai: {
        plainEnglishExplanation: 'AUTOMATED_EXPLANATION_MARKER',
        businessImpact: 'AUTOMATED_IMPACT_MARKER',
        relatedFindingIds: [],
      },
    });
    const model = buildReportModel(makeScan(), makeRepo(), [enriched]);

    const html = await new HtmlReportGenerator().generate(model);

    expect(html).toContain('Automated analysis');
    expect(html).not.toContain('AI analysis');
    expect(html).toContain('AUTOMATED_EXPLANATION_MARKER');
    expect(html).toContain('AUTOMATED_IMPACT_MARKER');
  });

  it('omits the automated-analysis panel entirely when a finding has no enrichment', async () => {
    const model = buildReportModel(makeScan(), makeRepo(), [makeFinding({ id: 'f_plain' })]);
    const html = await new HtmlReportGenerator().generate(model);
    // Checks the rendered body content, not the always-present stylesheet
    // rule (`.ai-panel-title { ... }`) — that class name legitimately
    // appears in <style> regardless of any finding's enrichment.
    expect(html).not.toContain('<div class="ai-panel">');
  });
});
