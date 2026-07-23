export type ReportFormat = 'html' | 'pdf' | 'json' | 'sarif';

export interface Report {
  id: string;
  orgId: string;
  scanId: string;
  format: ReportFormat;
  storageKey: string;
  createdAt: Date;
}

export interface CreateReportInput {
  orgId: string;
  scanId: string;
  format: ReportFormat;
  storageKey: string;
}

export interface ReportRepository {
  findById(orgId: string, id: string): Promise<Report | null>;
  listByScan(orgId: string, scanId: string): Promise<Report[]>;
  /**
   * Upsert on (scanId, format) — see docs/adr/0019. Regenerating a report
   * in a format that already exists for this scan replaces it rather than
   * creating a duplicate row, honoring the schema's
   * `@@unique([scanId, format])` constraint.
   */
  create(input: CreateReportInput): Promise<Report>;
}
