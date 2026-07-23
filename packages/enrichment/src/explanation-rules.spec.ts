import { describe, expect, it } from 'vitest';
import { explainFinding } from './explanation-rules.js';
import { makeFinding } from './testing/fixtures.js';

describe('explainFinding', () => {
  it('uses the semgrep eval-detected template for a matching ruleId substring', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'semgrep',
      ruleId: 'p.default.javascript.lang.security.audit.eval-detected',
      title: 'Use of eval()',
    });

    expect(explainFinding(finding)).toContain('arbitrary JavaScript');
  });

  it('uses the gitleaks template for any gitleaks finding regardless of the specific secret rule', () => {
    const finding = makeFinding({ id: 'f1', source: 'gitleaks', ruleId: 'slack-bot-token' });
    expect(explainFinding(finding)).toContain('committed to this repository');
  });

  it('uses the osv-scanner template, naming the advisory id', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'osv-scanner',
      ruleId: 'GHSA-abcd-1234',
      title: 'lodash@4.17.15',
    });
    expect(explainFinding(finding)).toContain('GHSA-abcd-1234');
  });

  it('uses the eslint no-undef template', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'eslint',
      ruleId: 'no-undef',
      title: 'x is not defined',
    });
    expect(explainFinding(finding)).toContain("isn't declared anywhere");
  });

  it('uses the jscpd template, incorporating rootCause and riskDescription', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'jscpd',
      ruleId: 'duplicate-code',
      rootCause: 'ROOTCAUSE_MARKER',
      riskDescription: 'RISK_MARKER',
    });
    const explanation = explainFinding(finding);
    expect(explanation).toContain('ROOTCAUSE_MARKER');
    expect(explanation).toContain('RISK_MARKER');
  });

  it('uses the dependency-graph circular-dependency template', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'dependency-graph',
      ruleId: 'circular-dependency',
    });
    expect(explainFinding(finding)).toContain('depend on each other in a cycle');
  });

  it('falls back to the category-level template for an unmatched rule, without inventing new facts', () => {
    const finding = makeFinding({
      id: 'f1',
      source: 'some-future-tool',
      ruleId: 'brand-new-rule',
      category: 'performance',
      rootCause: 'ROOTCAUSE_MARKER',
      riskDescription: 'RISK_MARKER',
    });

    const explanation = explainFinding(finding);
    expect(explanation).toContain('ROOTCAUSE_MARKER');
    expect(explanation).toContain('RISK_MARKER');
  });
});
