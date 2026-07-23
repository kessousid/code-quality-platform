import type {
  CoverageFileResult,
  CoverageRun,
  Finding,
  GeneratedTestFile,
  Repo,
  Scan,
  TestCaseResult,
  UnitTestRun,
} from '@cqp/core';

export function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    ref: 'main',
    mode: 'full',
    status: 'completed',
    completedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo_1',
    orgId: 'org_1',
    name: 'sample-repo',
    provider: 'local',
    defaultBranch: 'main',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    scanId: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'eval-detected',
    title: 'Use of eval() with untrusted input',
    severity: 'high',
    confidence: 'high',
    locations: [{ filePath: 'src/vuln.js', startLine: 6, endLine: 6 }],
    rootCause: 'User-controlled input reaches eval().',
    riskDescription: 'Arbitrary code execution.',
    recommendedFix: 'Remove eval(); use JSON.parse or a safe parser.',
    references: [{ title: 'CWE-95', url: 'https://cwe.mitre.org/data/definitions/95.html' }],
    patchPrConfirmedByUser: false,
    firstSeenScanId: 'scan_1',
    lastSeenScanId: 'scan_1',
    status: 'open',
    ...overrides,
  };
}

export function makeUnitTestRun(overrides: Partial<UnitTestRun> = {}): UnitTestRun {
  return {
    id: 'run_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    target: { path: 'src/math.ts' },
    generator: 'gemini',
    status: 'completed',
    testsTotal: 2,
    testsPassed: 1,
    testsFailed: 1,
    completedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeGeneratedTestFile(
  overrides: Partial<GeneratedTestFile> = {},
): GeneratedTestFile {
  return {
    id: 'gf_1',
    runId: 'run_1',
    sourceFilePath: 'src/math.ts',
    testFilePath: 'src/math.generated.test.ts',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeTestCaseResult(
  overrides: Partial<TestCaseResult> & { id: string },
): TestCaseResult {
  return {
    runId: 'run_1',
    testFilePath: 'src/math.generated.test.ts',
    testName: 'adds two numbers',
    status: 'passed',
    durationMs: 3,
    ...overrides,
  };
}

export function makeTestCaseResults(): TestCaseResult[] {
  return [
    makeTestCaseResult({ id: 't1', testName: 'adds two numbers', status: 'passed' }),
    makeTestCaseResult({
      id: 't2',
      testName: 'fails on purpose',
      status: 'failed',
      failureMessage: 'Expected 3 but received 2',
    }),
  ];
}

export function makeCoverageRun(overrides: Partial<CoverageRun> = {}): CoverageRun {
  return {
    id: 'crun_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    baseRef: 'main',
    status: 'completed',
    gatePassed: false,
    testsTotal: 2,
    testsPassed: 2,
    testsFailed: 0,
    changedLinesTotal: 3,
    uncoveredLinesTotal: 1,
    completedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeCoverageFileResult(
  overrides: Partial<CoverageFileResult> & { id: string },
): CoverageFileResult {
  return {
    runId: 'crun_1',
    filePath: 'src/math.ts',
    changedLines: [4, 5, 6],
    uncoveredLines: [6],
    status: 'uncovered',
    ...overrides,
  };
}

export function makeCoverageFileResults(): CoverageFileResult[] {
  return [
    makeCoverageFileResult({
      id: 'cf1',
      filePath: 'src/math.ts',
      changedLines: [4, 5, 6],
      uncoveredLines: [6],
      status: 'uncovered',
    }),
    makeCoverageFileResult({
      id: 'cf2',
      filePath: 'src/util.ts',
      changedLines: [10],
      uncoveredLines: [],
      status: 'covered',
    }),
  ];
}

export function makeFindings(): Finding[] {
  return [
    makeFinding({
      id: 'f1',
      severity: 'critical',
      category: 'secret-detection',
      source: 'gitleaks',
      ruleId: 'slack-bot-token',
      title: 'Hardcoded Slack token',
    }),
    makeFinding({
      id: 'f2',
      severity: 'high',
      category: 'security',
      source: 'semgrep',
      ruleId: 'eval-detected',
      title: 'Use of eval() with untrusted input',
    }),
    makeFinding({
      id: 'f3',
      severity: 'medium',
      category: 'dependency-vulnerability',
      source: 'osv-scanner',
      ruleId: 'GHSA-xxxx',
      title: 'lodash@4.17.15 vulnerable',
    }),
    makeFinding({
      id: 'f4',
      severity: 'low',
      category: 'code-quality',
      source: 'jscpd',
      ruleId: 'duplicate-code',
      title: 'Duplicated code block',
    }),
    makeFinding({
      id: 'f5',
      severity: 'medium',
      category: 'architecture',
      source: 'dependency-graph',
      ruleId: 'circular-dependency',
      title: 'Circular dependency',
      status: 'fixed',
    }),
  ];
}
