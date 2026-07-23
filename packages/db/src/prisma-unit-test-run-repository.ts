import type { PrismaClient } from '@prisma/client';
import type {
  CreateUnitTestRunInput,
  PaginatedResult,
  PaginationParams,
  UnitTestRun,
  UnitTestRunProgress,
  UnitTestRunRepository,
  UnitTestRunResultsSummary,
  UnitTestRunStatus,
} from '@cqp/core';
import {
  testGeneratorTypeFromDb,
  testGeneratorTypeToDb,
  unitTestRunStatusFromDb,
  unitTestRunStatusToDb,
} from './mappers.js';

/** Infrastructure adapter (ADR-0010) for the port from @cqp/core — see docs/adr/0024. Mirrors PrismaScanRepository's shape closely on purpose. */
export class PrismaUnitTestRunRepository implements UnitTestRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUnitTestRunInput): Promise<UnitTestRun> {
    const row = await this.prisma.unitTestRun.create({
      data: {
        orgId: input.orgId,
        repoId: input.repoId,
        targetPath: input.target.path,
        targetFunction: input.target.functionName ?? null,
        generator: testGeneratorTypeToDb(input.generator ?? 'gemini'),
      },
    });
    return this.toDomain(row);
  }

  async findById(orgId: string, id: string): Promise<UnitTestRun | null> {
    const row = await this.prisma.unitTestRun.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<UnitTestRun>> {
    const where = { orgId, repoId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.unitTestRun.findMany({
        where,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.unitTestRun.count({ where }),
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
    status: UnitTestRunStatus,
    errorMessage?: string,
  ): Promise<UnitTestRun> {
    const existing = await this.prisma.unitTestRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`UnitTestRun not found: ${id}`);
    }

    const row = await this.prisma.unitTestRun.update({
      where: { id },
      data: {
        status: unitTestRunStatusToDb(status),
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
    progress: UnitTestRunProgress,
  ): Promise<UnitTestRun> {
    const existing = await this.prisma.unitTestRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`UnitTestRun not found: ${id}`);
    }

    const row = await this.prisma.unitTestRun.update({
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
    summary: UnitTestRunResultsSummary,
  ): Promise<UnitTestRun> {
    const existing = await this.prisma.unitTestRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`UnitTestRun not found: ${id}`);
    }

    const row = await this.prisma.unitTestRun.update({
      where: { id },
      data: {
        testsTotal: summary.testsTotal,
        testsPassed: summary.testsPassed,
        testsFailed: summary.testsFailed,
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    repoId: string;
    targetPath: string;
    targetFunction: string | null;
    generator: Parameters<typeof testGeneratorTypeFromDb>[0];
    status: Parameters<typeof unitTestRunStatusFromDb>[0];
    filesTotal: number | null;
    filesCompleted: number | null;
    currentFilePath: string | null;
    testsTotal: number | null;
    testsPassed: number | null;
    testsFailed: number | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): UnitTestRun {
    return {
      id: row.id,
      orgId: row.orgId,
      repoId: row.repoId,
      target: {
        path: row.targetPath,
        ...(row.targetFunction !== null ? { functionName: row.targetFunction } : {}),
      },
      generator: testGeneratorTypeFromDb(row.generator),
      status: unitTestRunStatusFromDb(row.status),
      createdAt: row.createdAt,
      ...(row.filesTotal !== null ? { filesTotal: row.filesTotal } : {}),
      ...(row.filesCompleted !== null ? { filesCompleted: row.filesCompleted } : {}),
      ...(row.currentFilePath !== null ? { currentFilePath: row.currentFilePath } : {}),
      ...(row.testsTotal !== null ? { testsTotal: row.testsTotal } : {}),
      ...(row.testsPassed !== null ? { testsPassed: row.testsPassed } : {}),
      ...(row.testsFailed !== null ? { testsFailed: row.testsFailed } : {}),
      ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
      ...(row.startedAt !== null ? { startedAt: row.startedAt } : {}),
      ...(row.completedAt !== null ? { completedAt: row.completedAt } : {}),
    };
  }
}
