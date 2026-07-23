import type { PrismaClient } from '@prisma/client';
import type { CreateReportInput, Report, ReportRepository } from '@cqp/core';
import { reportFormatFromDb, reportFormatToDb } from './mappers.js';

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(orgId: string, id: string): Promise<Report | null> {
    const row = await this.prisma.report.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByScan(orgId: string, scanId: string): Promise<Report[]> {
    const rows = await this.prisma.report.findMany({
      where: { orgId, scanId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  /** Upsert on the schema's `@@unique([scanId, format])` — see docs/adr/0019. */
  async create(input: CreateReportInput): Promise<Report> {
    const row = await this.prisma.report.upsert({
      where: { scanId_format: { scanId: input.scanId, format: reportFormatToDb(input.format) } },
      create: {
        orgId: input.orgId,
        scanId: input.scanId,
        format: reportFormatToDb(input.format),
        storageKey: input.storageKey,
      },
      update: { storageKey: input.storageKey },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    scanId: string;
    format: Parameters<typeof reportFormatFromDb>[0];
    storageKey: string;
    createdAt: Date;
  }): Report {
    return {
      id: row.id,
      orgId: row.orgId,
      scanId: row.scanId,
      format: reportFormatFromDb(row.format),
      storageKey: row.storageKey,
      createdAt: row.createdAt,
    };
  }
}
