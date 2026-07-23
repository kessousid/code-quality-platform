import { randomUUID } from 'node:crypto';
import type {
  CreateUnitTestReportInput,
  UnitTestReport,
  UnitTestReportRepository,
} from '@cqp/core';

/** Mirrors InMemoryReportRepository exactly (docs/adr/0019, docs/adr/0024). */
export class InMemoryUnitTestReportRepository implements UnitTestReportRepository {
  constructor(private readonly reports: UnitTestReport[] = []) {}

  seed(report: UnitTestReport): void {
    this.reports.push(report);
  }

  async findById(orgId: string, id: string): Promise<UnitTestReport | null> {
    return this.reports.find((r) => r.id === id && r.orgId === orgId) ?? null;
  }

  async listByRun(orgId: string, unitTestRunId: string): Promise<UnitTestReport[]> {
    return this.reports.filter((r) => r.orgId === orgId && r.unitTestRunId === unitTestRunId);
  }

  async create(input: CreateUnitTestReportInput): Promise<UnitTestReport> {
    const existing = this.reports.find(
      (r) =>
        r.orgId === input.orgId &&
        r.unitTestRunId === input.unitTestRunId &&
        r.format === input.format,
    );
    if (existing) {
      existing.storageKey = input.storageKey;
      return existing;
    }

    const report: UnitTestReport = {
      id: randomUUID(),
      orgId: input.orgId,
      unitTestRunId: input.unitTestRunId,
      format: input.format,
      storageKey: input.storageKey,
      createdAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }
}
