import type { PrismaClient } from '@prisma/client';
import type {
  CreateUnitTestReportInput,
  UnitTestReport,
  UnitTestReportRepository,
} from '@cqp/core';
import { unitTestReportFormatFromDb, unitTestReportFormatToDb } from './mappers.js';

/** Mirrors PrismaReportRepository exactly (docs/adr/0019, docs/adr/0024). */
export class PrismaUnitTestReportRepository implements UnitTestReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(orgId: string, id: string): Promise<UnitTestReport | null> {
    const row = await this.prisma.unitTestReport.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRun(orgId: string, unitTestRunId: string): Promise<UnitTestReport[]> {
    const rows = await this.prisma.unitTestReport.findMany({
      where: { orgId, unitTestRunId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  /** Upsert on the schema's `@@unique([unitTestRunId, format])`. */
  async create(input: CreateUnitTestReportInput): Promise<UnitTestReport> {
    const row = await this.prisma.unitTestReport.upsert({
      where: {
        unitTestRunId_format: {
          unitTestRunId: input.unitTestRunId,
          format: unitTestReportFormatToDb(input.format),
        },
      },
      create: {
        orgId: input.orgId,
        unitTestRunId: input.unitTestRunId,
        format: unitTestReportFormatToDb(input.format),
        storageKey: input.storageKey,
      },
      update: { storageKey: input.storageKey },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    unitTestRunId: string;
    format: Parameters<typeof unitTestReportFormatFromDb>[0];
    storageKey: string;
    createdAt: Date;
  }): UnitTestReport {
    return {
      id: row.id,
      orgId: row.orgId,
      unitTestRunId: row.unitTestRunId,
      format: unitTestReportFormatFromDb(row.format),
      storageKey: row.storageKey,
      createdAt: row.createdAt,
    };
  }
}
