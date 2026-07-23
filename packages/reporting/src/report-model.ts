import type { AnalysisCategory, Finding, Repo, Scan, Severity } from '@cqp/core';

/**
 * Per-severity penalty applied to each *open* finding when computing the
 * health score below. Invented for this platform, not derived from an
 * external standard — see docs/adr/0019 for why, and revisit deliberately
 * rather than tweaking ad hoc.
 */
const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 10,
  medium: 4,
  low: 1,
  info: 0,
};

export interface ReportSummary {
  totalFindings: number;
  openFindings: number;
  bySeverity: Record<Severity, number>;
  byCategory: Partial<Record<AnalysisCategory, number>>;
  /** 0-100, floored at 0. 100 = no open findings. See SEVERITY_PENALTY above. */
  healthScore: number;
}

export interface ReportModel {
  scan: Pick<Scan, 'id' | 'ref' | 'mode' | 'status' | 'completedAt'>;
  repo: Pick<Repo, 'id' | 'name'>;
  summary: ReportSummary;
  findings: Finding[];
  generatedAt: Date;
}

function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

/**
 * Exported directly — Phase 10's `GetScanSummaryUseCase` needs the score
 * tiles without generating/persisting a full report, so this is the
 * single source of truth for the health-score formula either way.
 */
export function computeReportSummary(findings: Finding[]): ReportSummary {
  const bySeverity = emptySeverityCounts();
  const byCategory: Partial<Record<AnalysisCategory, number>> = {};
  let openFindings = 0;
  let penalty = 0;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;

    if (finding.status === 'open') {
      openFindings += 1;
      penalty += SEVERITY_PENALTY[finding.severity];
    }
  }

  return {
    totalFindings: findings.length,
    openFindings,
    bySeverity,
    byCategory,
    healthScore: Math.max(0, 100 - penalty),
  };
}

export function buildReportModel(scan: Scan, repo: Repo, findings: Finding[]): ReportModel {
  return {
    scan: {
      id: scan.id,
      ref: scan.ref,
      mode: scan.mode,
      status: scan.status,
      ...(scan.completedAt !== undefined ? { completedAt: scan.completedAt } : {}),
    },
    repo: { id: repo.id, name: repo.name },
    summary: computeReportSummary(findings),
    findings,
    generatedAt: new Date(),
  };
}
