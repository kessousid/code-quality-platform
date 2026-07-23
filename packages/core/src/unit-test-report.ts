/** Mirrors report.ts (docs/adr/0019) exactly, for UnitTestRun instead of Scan — see docs/adr/0024's follow-up: unit test results needed to become downloadable/shareable the same way scan reports already are. */
export type UnitTestReportFormat = 'json' | 'html' | 'pdf';

export interface UnitTestReport {
  id: string;
  orgId: string;
  unitTestRunId: string;
  format: UnitTestReportFormat;
  storageKey: string;
  createdAt: Date;
}

export interface CreateUnitTestReportInput {
  orgId: string;
  unitTestRunId: string;
  format: UnitTestReportFormat;
  storageKey: string;
}

export interface UnitTestReportRepository {
  findById(orgId: string, id: string): Promise<UnitTestReport | null>;
  listByRun(orgId: string, unitTestRunId: string): Promise<UnitTestReport[]>;
  /** Upsert on (unitTestRunId, format) — regenerating a report in a format that already exists replaces it rather than duplicating, honoring `@@unique([unitTestRunId, format])`. */
  create(input: CreateUnitTestReportInput): Promise<UnitTestReport>;
}
