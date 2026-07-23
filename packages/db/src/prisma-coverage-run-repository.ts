import type { PrismaClient } from '@prisma/client';
import type {
  CoverageRun,
  CoverageRunProgress,
  CoverageRunRepository,
  CoverageRunResultsSummary,
  CoverageRunStatus,
  CreateCoverageRunInput,
  PaginatedResult,
  PaginationParams,
} from '@cqp/core';
import { coverageRunStatusFromDb, coverageRunStatusToDb } from './mappers.js';

/** Infrastructure adapter (ADR-0010) for the port from @cqp/core — see docs/adr/0025. Mirrors PrismaUnitTestRunRepository's shape closely on purpose. */
export class PrismaCoverageRunRepository implements CoverageRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateCoverageRunInput & { baseRef: string }): Promise<CoverageRun> {
    const row = await this.prisma.coverageRun.create({
      data: {
        orgId: input.orgId,
        repoId: input.repoId,
        baseRef: input.baseRef,
      },
    });
    return this.toDomain(row);
  }

  async findById(orgId: string, id: string): Promise<CoverageRun | null> {
    const row = await this.prisma.coverageRun.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CoverageRun>> {
    const where = { orgId, repoId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.coverageRun.findMany({
        where,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coverageRun.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDomain(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    orgId: string,
    id: string,
    status: CoverageRunStatus,
    errorMessage?: string,
  ): Promise<CoverageRun> {
    const existing = await this.prisma.coverageRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`CoverageRun not found: ${id}`);
    }

    const row = await this.prisma.coverageRun.update({
      where: { id },
      data: {
        status: coverageRunStatusToDb(status),
        ...(status === 'running' && existing.startedAt === null ? { startedAt: new Date() } : {}),
        ...((status === 'completed' || status === 'failed' || status === 'cancelled') &&
        existing.completedAt === null
          ? { completedAt: new Date() }
          : {}),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      },
    });
    return this.toDomain(row);
  }

  async updateProgress(
    orgId: string,
    id: string,
    progress: CoverageRunProgress,
  ): Promise<CoverageRun> {
    const existing = await this.prisma.coverageRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`CoverageRun not found: ${id}`);
    }

    const row = await this.prisma.coverageRun.update({
      where: { id },
      data: {
        ...(progress.filesTotal !== undefined ? { filesTotal: progress.filesTotal } : {}),
        ...(progress.filesCompleted !== undefined
          ? { filesCompleted: progress.filesCompleted }
          : {}),
        ...(progress.currentFilePath !== undefined
          ? { currentFilePath: progress.currentFilePath }
          : {}),
      },
    });
    return this.toDomain(row);
  }

  async updateResultsSummary(
    orgId: string,
    id: string,
    summary: CoverageRunResultsSummary,
  ): Promise<CoverageRun> {
    const existing = await this.prisma.coverageRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`CoverageRun not found: ${id}`);
    }

    const row = await this.prisma.coverageRun.update({
      where: { id },
      data: {
        testsTotal: summary.testsTotal,
        testsPassed: summary.testsPassed,
        testsFailed: summary.testsFailed,
        changedLinesTotal: summary.changedLinesTotal,
        uncoveredLinesTotal: summary.uncoveredLinesTotal,
        gatePassed: summary.gatePassed,
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    repoId: string;
    baseRef: string;
    status: Parameters<typeof coverageRunStatusFromDb>[0];
    gatePassed: boolean | null;
    filesTotal: number | null;
    filesCompleted: number | null;
    currentFilePath: string | null;
    testsTotal: number | null;
    testsPassed: number | null;
    testsFailed: number | null;
    changedLinesTotal: number | null;
    uncoveredLinesTotal: number | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): CoverageRun {
    return {
      id: row.id,
      orgId: row.orgId,
      repoId: row.repoId,
      baseRef: row.baseRef,
      status: coverageRunStatusFromDb(row.status),
      createdAt: row.createdAt,
      ...(row.gatePassed !== null ? { gatePassed: row.gatePassed } : {}),
      ...(row.filesTotal !== null ? { filesTotal: row.filesTotal } : {}),
      ...(row.filesCompleted !== null ? { filesCompleted: row.filesCompleted } : {}),
      ...(row.currentFilePath !== null ? { currentFilePath: row.currentFilePath } : {}),
      ...(row.testsTotal !== null ? { testsTotal: row.testsTotal } : {}),
      ...(row.testsPassed !== null ? { testsPassed: row.testsPassed } : {}),
      ...(row.testsFailed !== null ? { testsFailed: row.testsFailed } : {}),
      ...(row.changedLinesTotal !== null ? { changedLinesTotal: row.changedLinesTotal } : {}),
      ...(row.uncoveredLinesTotal !== null ? { uncoveredLinesTotal: row.uncoveredLinesTotal } : {}),
      ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
      ...(row.startedAt !== null ? { startedAt: row.startedAt } : {}),
      ...(row.completedAt !== null ? { completedAt: row.completedAt } : {}),
    };
  }
}
