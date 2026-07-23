import type { PrismaClient } from '@prisma/client';
import type {
  CoverageReport,
  CoverageReportRepository,
  CreateCoverageReportInput,
} from '@cqp/core';
import { coverageReportFormatFromDb, coverageReportFormatToDb } from './mappers.js';

/** Mirrors PrismaUnitTestReportRepository exactly (docs/adr/0019, docs/adr/0024, docs/adr/0025). */
export class PrismaCoverageReportRepository implements CoverageReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(orgId: string, id: string): Promise<CoverageReport | null> {
    const row = await this.prisma.coverageReport.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRun(orgId: string, coverageRunId: string): Promise<CoverageReport[]> {
    const rows = await this.prisma.coverageReport.findMany({
      where: { orgId, coverageRunId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  /** Upsert on the schema's `@@unique([coverageRunId, format])`. */
  async create(input: CreateCoverageReportInput): Promise<CoverageReport> {
    const row = await this.prisma.coverageReport.upsert({
      where: {
        coverageRunId_format: {
          coverageRunId: input.coverageRunId,
          format: coverageReportFormatToDb(input.format),
        },
      },
      create: {
        orgId: input.orgId,
        coverageRunId: input.coverageRunId,
        format: coverageReportFormatToDb(input.format),
        storageKey: input.storageKey,
      },
      update: { storageKey: input.storageKey },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    coverageRunId: string;
    format: Parameters<typeof coverageReportFormatFromDb>[0];
    storageKey: string;
    createdAt: Date;
  }): CoverageReport {
    return {
      id: row.id,
      orgId: row.orgId,
      coverageRunId: row.coverageRunId,
      format: coverageReportFormatFromDb(row.format),
      storageKey: row.storageKey,
      createdAt: row.createdAt,
    };
  }
}
