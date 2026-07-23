/** Mirrors unit-test-report.ts exactly, for CoverageRun instead — docs/adr/0025. */
export type CoverageReportFormat = 'json' | 'html' | 'pdf';

export interface CoverageReport {
  id: string;
  orgId: string;
  coverageRunId: string;
  format: CoverageReportFormat;
  storageKey: string;
  createdAt: Date;
}

export interface CreateCoverageReportInput {
  orgId: string;
  coverageRunId: string;
  format: CoverageReportFormat;
  storageKey: string;
}

export interface CoverageReportRepository {
  findById(orgId: string, id: string): Promise<CoverageReport | null>;
  listByRun(orgId: string, coverageRunId: string): Promise<CoverageReport[]>;
  /** Upsert on (coverageRunId, format) — regenerating a report in a format that already exists replaces it rather than duplicating, honoring `@@unique([coverageRunId, format])`. */
  create(input: CreateCoverageReportInput): Promise<CoverageReport>;
}
