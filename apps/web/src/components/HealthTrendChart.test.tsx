import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Scan } from '@cqp/core';
import type { ReportSummary } from '@cqp/reporting';
import type { RepoTrendPoint } from '../api/hooks.js';
import { HealthTrendChart } from './HealthTrendChart.js';

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 'scan-1',
    orgId: 'org-1',
    repoId: 'repo-1',
    ref: 'main',
    mode: 'full',
    status: 'completed',
    createdAt: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    totalFindings: 3,
    openFindings: 3,
    bySeverity: { critical: 0, high: 0, medium: 3, low: 0, info: 0 },
    byCategory: {},
    healthScore: 88,
    ...overrides,
  };
}

describe('HealthTrendChart', () => {
  it('shows no caveat legend when every scan completed with real findings data', () => {
    const points: RepoTrendPoint[] = [
      { scan: makeScan(), summary: makeSummary() },
      { scan: makeScan({ id: 'scan-2' }), summary: makeSummary() },
    ];

    render(<HealthTrendChart points={points} />);

    expect(screen.queryByText(/Failed scan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zero findings/)).not.toBeInTheDocument();
  });

  it('flags a failed scan distinctly, even though it still has a computed score', () => {
    const points: RepoTrendPoint[] = [
      {
        scan: makeScan({ status: 'failed' }),
        summary: makeSummary({ totalFindings: 21, openFindings: 21, healthScore: 1 }),
      },
    ];

    render(<HealthTrendChart points={points} />);

    expect(screen.getByText(/Failed scan/)).toBeInTheDocument();
    expect(screen.queryByText(/Zero findings/)).not.toBeInTheDocument();
  });

  it('flags a completed scan with zero findings as low-confidence, not silently "clean"', () => {
    const points: RepoTrendPoint[] = [
      {
        scan: makeScan({ status: 'completed' }),
        summary: makeSummary({ totalFindings: 0, openFindings: 0, healthScore: 100 }),
      },
    ];

    render(<HealthTrendChart points={points} />);

    expect(screen.getByText(/Zero findings/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed scan/)).not.toBeInTheDocument();
  });

  it('does not double-flag a failed scan that also happens to have zero findings', () => {
    const points: RepoTrendPoint[] = [
      {
        scan: makeScan({ status: 'failed' }),
        summary: makeSummary({ totalFindings: 0, openFindings: 0, healthScore: 100 }),
      },
    ];

    render(<HealthTrendChart points={points} />);

    expect(screen.getByText(/Failed scan/)).toBeInTheDocument();
    expect(screen.queryByText(/Zero findings/)).not.toBeInTheDocument();
  });
});
