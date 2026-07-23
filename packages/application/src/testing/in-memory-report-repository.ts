import { randomUUID } from 'node:crypto';
import type { CreateReportInput, Report, ReportRepository } from '@cqp/core';

export class InMemoryReportRepository implements ReportRepository {
  constructor(private readonly reports: Report[] = []) {}

  seed(report: Report): void {
    this.reports.push(report);
  }

  async findById(orgId: string, id: string): Promise<Report | null> {
    return this.reports.find((r) => r.id === id && r.orgId === orgId) ?? null;
  }

  async listByScan(orgId: string, scanId: string): Promise<Report[]> {
    return this.reports.filter((r) => r.orgId === orgId && r.scanId === scanId);
  }

  async create(input: CreateReportInput): Promise<Report> {
    const existing = this.reports.find(
      (r) => r.orgId === input.orgId && r.scanId === input.scanId && r.format === input.format,
    );
    if (existing) {
      existing.storageKey = input.storageKey;
      return existing;
    }

    const report: Report = {
      id: randomUUID(),
      orgId: input.orgId,
      scanId: input.scanId,
      format: input.format,
      storageKey: input.storageKey,
      createdAt: new Date(),
    };
    this.reports.push(report);
    return report;
  }
}
