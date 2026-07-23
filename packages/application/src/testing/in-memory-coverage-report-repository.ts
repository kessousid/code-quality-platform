import { randomUUID } from 'node:crypto';
import type {
  CoverageReport,
  CoverageReportRepository,
  CreateCoverageReportInput,
} from '@cqp/core';

/** Mirrors InMemoryUnitTestReportRepository exactly (docs/adr/0019, docs/adr/0024, docs/adr/0025). */
export class InMemoryCoverageReportRepository implements CoverageReportRepository {
  constructor(private readonly reports: CoverageReport[] = []) {}

  seed(report: CoverageReport): void {
    this.reports.push(report);
  }

  async findById(orgId: string, id: string): Promise<CoverageReport | null> {
    return this.reports.find((r) => r.id === id && r.orgId === orgId) ?? null;
  }

  async listByRun(orgId: string, coverageRunId: string): Promise<CoverageReport[]> {
    return this.reports.filter((r) => r.orgId === orgId && r.coverageRunId === coverageRunId);
  }

  async create(input: CreateCoverageReportInput): Promise<CoverageReport> {
    const existing = this.reports.find(
      (r) =>
        r.orgId === input.orgId &&
        r.coverageRunId === input.coverageRunId &&
        r.format === input.format,
    );
    if (existing) {
      existing.storageKey = input.storageKey;
      return existing;
    }

    const report: CoverageReport = {
      id: randomUUID(),
      orgId: input.orgId,
      coverageRunId: input.coverageRunId,
      format: input.format,
      storageKey: input.storageKey,
      createdAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }
}
