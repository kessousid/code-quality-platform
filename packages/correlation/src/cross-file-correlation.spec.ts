import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import { correlateByFile } from './cross-file-correlation.js';

function makeFinding(id: string, filePaths: string[]): Finding {
  return {
    id,
    scanId: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'x',
    title: 'x',
    severity: 'medium',
    confidence: 'high',
    locations: filePaths.map((filePath) => ({ filePath, startLine: 1 })),
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

describe('correlateByFile', () => {
  it('relates findings that share a file path', () => {
    const findings = [
      makeFinding('f1', ['src/a.ts']),
      makeFinding('f2', ['src/a.ts']),
      makeFinding('f3', ['src/b.ts']),
    ];

    const related = correlateByFile(findings);

    expect(related.get('f1')).toEqual(['f2']);
    expect(related.get('f2')).toEqual(['f1']);
    expect(related.get('f3')).toEqual([]);
  });

  it('relates findings whose locations overlap on only one of several files', () => {
    const findings = [makeFinding('f1', ['src/a.ts', 'src/c.ts']), makeFinding('f2', ['src/c.ts'])];

    const related = correlateByFile(findings);

    expect(related.get('f1')).toEqual(['f2']);
  });

  it('returns an empty array, not undefined, for a finding with no relations', () => {
    const findings = [makeFinding('f1', ['src/a.ts'])];
    expect(correlateByFile(findings).get('f1')).toEqual([]);
  });
});
