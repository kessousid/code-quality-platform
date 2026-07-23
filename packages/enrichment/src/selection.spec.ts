import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import { selectFindingsForEnrichment } from './selection.js';

function makeFinding(
  id: string,
  severity: Finding['severity'],
  confidence: Finding['confidence'],
): Finding {
  return {
    id,
    scanId: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'x',
    title: 'x',
    severity,
    confidence,
    locations: [],
    rootCause: 'x',
    riskDescription: 'x',
    recommendedFix: 'x',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: 'scan_1',
    lastSeenScanId: 'scan_1',
    status: 'open',
  };
}

describe('selectFindingsForEnrichment', () => {
  it('sorts by severity first, most severe first', () => {
    const findings = [
      makeFinding('low', 'low', 'high'),
      makeFinding('critical', 'critical', 'high'),
      makeFinding('medium', 'medium', 'high'),
    ];

    const selected = selectFindingsForEnrichment(findings, 3);
    expect(selected.map((f) => f.id)).toEqual(['critical', 'medium', 'low']);
  });

  it('breaks severity ties by confidence, highest first', () => {
    const findings = [
      makeFinding('a', 'high', 'low'),
      makeFinding('b', 'high', 'high'),
      makeFinding('c', 'high', 'medium'),
    ];

    const selected = selectFindingsForEnrichment(findings, 3);
    expect(selected.map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('truncates to maxCount', () => {
    const findings = [makeFinding('a', 'critical', 'high'), makeFinding('b', 'high', 'high')];
    expect(selectFindingsForEnrichment(findings, 1).map((f) => f.id)).toEqual(['a']);
  });

  it('rejects a negative maxCount', () => {
    expect(() => selectFindingsForEnrichment([], -1)).toThrow('maxCount must be >= 0');
  });
});
