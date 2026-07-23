import { describe, expect, it } from 'vitest';
import { buildReportModel } from './report-model.js';
import { makeFinding, makeFindings, makeRepo, makeScan } from './testing/fixtures.js';

describe('buildReportModel', () => {
  it('aggregates counts and computes the documented health-score formula', () => {
    const model = buildReportModel(makeScan(), makeRepo(), makeFindings());

    expect(model.summary.totalFindings).toBe(5);
    // f5 (medium, circular-dependency) is status 'fixed' — not open.
    expect(model.summary.openFindings).toBe(4);

    expect(model.summary.bySeverity).toEqual({
      critical: 1,
      high: 1,
      medium: 2,
      low: 1,
      info: 0,
    });

    expect(model.summary.byCategory).toEqual({
      'secret-detection': 1,
      security: 1,
      'dependency-vulnerability': 1,
      'code-quality': 1,
      architecture: 1,
    });

    // Penalty from open findings only: critical(25) + high(10) + medium(4) + low(1) = 40.
    // f5 is fixed, so its medium severity contributes to bySeverity but not the penalty.
    expect(model.summary.healthScore).toBe(60);
  });

  it('floors the health score at 0 rather than going negative', () => {
    const manyCritical = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ id: `crit_${i}`, severity: 'critical' }),
    );
    const model = buildReportModel(makeScan(), makeRepo(), manyCritical);

    expect(model.summary.healthScore).toBe(0);
  });

  it('carries scan and repo identity through untouched', () => {
    const scan = makeScan({ id: 'scan_42', ref: 'feature/x', mode: 'incremental' });
    const repo = makeRepo({ id: 'repo_42', name: 'my-repo' });
    const model = buildReportModel(scan, repo, []);

    expect(model.scan).toEqual({
      id: 'scan_42',
      ref: 'feature/x',
      mode: 'incremental',
      status: 'completed',
      completedAt: scan.completedAt,
    });
    expect(model.repo).toEqual({ id: 'repo_42', name: 'my-repo' });
  });
});
