import { describe, expect, it } from 'vitest';
import type { AnalysisCategory } from '@cqp/core';
import { estimateBusinessImpact } from './business-impact-rules.js';
import { makeFinding } from './testing/fixtures.js';

const ALL_CATEGORIES: AnalysisCategory[] = [
  'code-quality',
  'security',
  'dependency-vulnerability',
  'secret-detection',
  'architecture',
  'performance',
  'database',
  'devops-iac',
  'test-coverage',
  'documentation',
  'best-practices',
  'technical-debt',
];

describe('estimateBusinessImpact', () => {
  it.each(ALL_CATEGORIES)('produces a non-empty statement for every category (%s)', (category) => {
    const finding = makeFinding({ id: 'f1', category, severity: 'high' });
    expect(estimateBusinessImpact(finding).length).toBeGreaterThan(0);
  });

  it('escalates language for critical security findings vs. low ones', () => {
    const critical = estimateBusinessImpact(
      makeFinding({ id: 'f1', category: 'security', severity: 'critical' }),
    );
    const low = estimateBusinessImpact(
      makeFinding({ id: 'f2', category: 'security', severity: 'low' }),
    );
    expect(critical).not.toBe(low);
    expect(critical).toContain('breach');
  });

  it('treats every leaked secret as urgent regardless of the plugin-assigned severity', () => {
    const impact = estimateBusinessImpact(
      makeFinding({ id: 'f1', category: 'secret-detection', severity: 'low' }),
    );
    expect(impact).toContain('urgent');
  });
});
