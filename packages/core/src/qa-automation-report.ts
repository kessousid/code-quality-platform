/** Mirrors unit-test-report.ts exactly, for QaAutomationRun instead of UnitTestRun. */
export type QaAutomationReportFormat = 'pdf';

export interface QaAutomationReport {
  id: string;
  orgId: string;
  runId: string;
  format: QaAutomationReportFormat;
  storageKey: string;
  createdAt: Date;
}

export interface CreateQaAutomationReportInput {
  orgId: string;
  runId: string;
  format: QaAutomationReportFormat;
  storageKey: string;
}

export interface QaAutomationReportRepository {
  findById(orgId: string, id: string): Promise<QaAutomationReport | null>;
  listByRun(orgId: string, runId: string): Promise<QaAutomationReport[]>;
  /** Upsert on (runId, format) — regenerating a report in a format that already exists replaces it rather than duplicating. */
  create(input: CreateQaAutomationReportInput): Promise<QaAutomationReport>;
}
