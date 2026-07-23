import type { PrismaClient } from '@prisma/client';
import type { CoverageFileResult, CoverageFileResultRepository } from '@cqp/core';
import { coverageFileStatusFromDb, coverageFileStatusToDb } from './mappers.js';

export class PrismaCoverageFileResultRepository implements CoverageFileResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMany(
    runId: string,
    results: Omit<CoverageFileResult, 'id' | 'runId'>[],
  ): Promise<CoverageFileResult[]> {
    if (results.length === 0) return [];
    await this.prisma.coverageFileResult.createMany({
      data: results.map((result) => ({
        runId,
        filePath: result.filePath,
        changedLines: result.changedLines,
        uncoveredLines: result.uncoveredLines,
        status: coverageFileStatusToDb(result.status),
      })),
    });
    return this.listByRun(runId);
  }

  async listByRun(runId: string): Promise<CoverageFileResult[]> {
    const rows = await this.prisma.coverageFileResult.findMany({
      where: { runId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      filePath: row.filePath,
      changedLines: row.changedLines,
      uncoveredLines: row.uncoveredLines,
      status: coverageFileStatusFromDb(row.status),
    }));
  }
}
