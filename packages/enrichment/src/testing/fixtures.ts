import type { Finding } from '@cqp/core';

export function makeFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    scanId: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'x',
    title: 'x',
    severity: 'medium',
    confidence: 'high',
    locations: [{ filePath: 'src/a.ts', startLine: 1 }],
    rootCause: 'root cause text',
    riskDescription: 'risk description text',
    recommendedFix: 'recommended fix text',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: 'scan_1',
    lastSeenScanId: 'scan_1',
    status: 'open',
    ...overrides,
  };
}
