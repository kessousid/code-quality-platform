import { randomUUID } from 'node:crypto';
import type {
  CreateQaAutomationReportInput,
  QaAutomationReport,
  QaAutomationReportRepository,
} from '@cqp/core';

/** Mirrors InMemoryUnitTestReportRepository exactly, for QaAutomationRun instead of UnitTestRun. */
export class InMemoryQaAutomationReportRepository implements QaAutomationReportRepository {
  constructor(private readonly reports: QaAutomationReport[] = []) {}

  async findById(orgId: string, id: string): Promise<QaAutomationReport | null> {
    return this.reports.find((r) => r.id === id && r.orgId === orgId) ?? null;
  }

  async listByRun(orgId: string, runId: string): Promise<QaAutomationReport[]> {
    return this.reports.filter((r) => r.orgId === orgId && r.runId === runId);
  }

  async create(input: CreateQaAutomationReportInput): Promise<QaAutomationReport> {
    const existing = this.reports.find(
      (r) => r.orgId === input.orgId && r.runId === input.runId && r.format === input.format,
    );
    if (existing) {
      existing.storageKey = input.storageKey;
      return existing;
    }

    const report: QaAutomationReport = {
      id: randomUUID(),
      orgId: input.orgId,
      runId: input.runId,
      format: input.format,
      storageKey: input.storageKey,
      createdAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }
}
