import type { PrismaClient } from '@prisma/client';
import type {
  CreateScanInput,
  PaginatedResult,
  PaginationParams,
  Scan,
  ScanProgress,
  ScanRepository,
  ScanStatus,
} from '@cqp/core';
import {
  categoryFromDb,
  categoryToDb,
  scanModeFromDb,
  scanModeToDb,
  scanStatusFromDb,
  scanStatusToDb,
} from './mappers.js';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client. Compiles and
 * typechecks against it; exercising it against a live Postgres is the same
 * deferred gap noted in Phases 3 and 4 (no Docker in this sandbox).
 */
export class PrismaScanRepository implements ScanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateScanInput): Promise<Scan> {
    const row = await this.prisma.scan.create({
      data: {
        orgId: input.orgId,
        repoId: input.repoId,
        ref: input.ref,
        mode: scanModeToDb(input.mode),
        categories: input.categories?.map(categoryToDb) ?? [],
        baseScanId: input.baseScanId ?? null,
        triggeredByUserId: input.triggeredByUserId ?? null,
      },
    });
    return this.toDomain(row);
  }

  async findById(orgId: string, id: string): Promise<Scan | null> {
    const row = await this.prisma.scan.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Scan>> {
    const where = { orgId, repoId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.scan.findMany({
        where,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.scan.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDomain(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(orgId: string, id: string, status: ScanStatus): Promise<Scan> {
    const existing = await this.prisma.scan.findFirst({ where: { id, orgId } });
    if (!existing) {
      // The caller (RunScanUseCase) already confirmed the scan exists via
      // findById before ever calling this — reaching here means it
      // vanished between calls, a bug/race to surface loudly, not a
      // normal not-found case to model as null.
      throw new Error(`Scan not found: ${id}`);
    }

    const row = await this.prisma.scan.update({
      where: { id },
      data: {
        status: scanStatusToDb(status),
        ...(status === 'running' && existing.startedAt === null ? { startedAt: new Date() } : {}),
        ...((status === 'completed' || status === 'failed' || status === 'cancelled') &&
        existing.completedAt === null
          ? { completedAt: new Date() }
          : {}),
      },
    });
    return this.toDomain(row);
  }

  async updateProgress(orgId: string, id: string, progress: ScanProgress): Promise<Scan> {
    const existing = await this.prisma.scan.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`Scan not found: ${id}`);
    }

    const row = await this.prisma.scan.update({
      where: { id },
      data: {
        ...(progress.pluginsTotal !== undefined ? { pluginsTotal: progress.pluginsTotal } : {}),
        ...(progress.pluginsCompleted !== undefined
          ? { pluginsCompleted: progress.pluginsCompleted }
          : {}),
        ...(progress.currentPluginId !== undefined
          ? { currentPluginId: progress.currentPluginId }
          : {}),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    repoId: string;
    ref: string;
    mode: Parameters<typeof scanModeFromDb>[0];
    status: Parameters<typeof scanStatusFromDb>[0];
    categories: Parameters<typeof categoryFromDb>[0][];
    baseScanId: string | null;
    triggeredByUserId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    pluginsTotal: number | null;
    pluginsCompleted: number | null;
    currentPluginId: string | null;
  }): Scan {
    return {
      id: row.id,
      orgId: row.orgId,
      repoId: row.repoId,
      ref: row.ref,
      mode: scanModeFromDb(row.mode),
      status: scanStatusFromDb(row.status),
      categories: row.categories.map(categoryFromDb),
      createdAt: row.createdAt,
      ...(row.baseScanId !== null ? { baseScanId: row.baseScanId } : {}),
      ...(row.triggeredByUserId !== null ? { triggeredByUserId: row.triggeredByUserId } : {}),
      ...(row.startedAt !== null ? { startedAt: row.startedAt } : {}),
      ...(row.completedAt !== null ? { completedAt: row.completedAt } : {}),
      ...(row.pluginsTotal !== null ? { pluginsTotal: row.pluginsTotal } : {}),
      ...(row.pluginsCompleted !== null ? { pluginsCompleted: row.pluginsCompleted } : {}),
      ...(row.currentPluginId !== null ? { currentPluginId: row.currentPluginId } : {}),
    };
  }
}
