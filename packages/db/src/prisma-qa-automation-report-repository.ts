import type { PrismaClient } from '@prisma/client';
import type {
  CreateQaAutomationReportInput,
  QaAutomationReport,
  QaAutomationReportRepository,
} from '@cqp/core';
import { qaAutomationReportFormatFromDb, qaAutomationReportFormatToDb } from './mappers.js';

/** Mirrors PrismaUnitTestReportRepository exactly, for QaAutomationRun instead of UnitTestRun. */
export class PrismaQaAutomationReportRepository implements QaAutomationReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(orgId: string, id: string): Promise<QaAutomationReport | null> {
    const row = await this.prisma.qaAutomationReport.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRun(orgId: string, runId: string): Promise<QaAutomationReport[]> {
    const rows = await this.prisma.qaAutomationReport.findMany({
      where: { orgId, runId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  /** Upsert on the schema's `@@unique([runId, format])`. */
  async create(input: CreateQaAutomationReportInput): Promise<QaAutomationReport> {
    const row = await this.prisma.qaAutomationReport.upsert({
      where: {
        runId_format: {
          runId: input.runId,
          format: qaAutomationReportFormatToDb(input.format),
        },
      },
      create: {
        orgId: input.orgId,
        runId: input.runId,
        format: qaAutomationReportFormatToDb(input.format),
        storageKey: input.storageKey,
      },
      update: { storageKey: input.storageKey },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    runId: string;
    format: Parameters<typeof qaAutomationReportFormatFromDb>[0];
    storageKey: string;
    createdAt: Date;
  }): QaAutomationReport {
    return {
      id: row.id,
      orgId: row.orgId,
      runId: row.runId,
      format: qaAutomationReportFormatFromDb(row.format),
      storageKey: row.storageKey,
      createdAt: row.createdAt,
    };
  }
}
