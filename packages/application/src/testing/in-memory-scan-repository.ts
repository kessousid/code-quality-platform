import { randomUUID } from 'node:crypto';
import type {
  CreateScanInput,
  PaginatedResult,
  PaginationParams,
  Scan,
  ScanProgress,
  ScanRepository,
  ScanStatus,
} from '@cqp/core';

/**
 * Test double proving the whole point of the port/adapter split (ADR-0010):
 * the application layer's tests never touch Prisma or a real database.
 * Shared across packages/application's own tests and apps/api's controller
 * tests via the `@cqp/application/testing` subpath export.
 */
export class InMemoryScanRepository implements ScanRepository {
  private readonly scans = new Map<string, Scan>();

  async create(input: CreateScanInput): Promise<Scan> {
    const scan: Scan = {
      id: randomUUID(),
      orgId: input.orgId,
      repoId: input.repoId,
      ref: input.ref,
      mode: input.mode,
      status: 'queued',
      createdAt: new Date(),
      ...(input.categories !== undefined ? { categories: input.categories } : {}),
      ...(input.baseScanId !== undefined ? { baseScanId: input.baseScanId } : {}),
      ...(input.triggeredByUserId !== undefined
        ? { triggeredByUserId: input.triggeredByUserId }
        : {}),
    };
    this.scans.set(scan.id, scan);
    return scan;
  }

  async findById(orgId: string, id: string): Promise<Scan | null> {
    const scan = this.scans.get(id);
    if (!scan || scan.orgId !== orgId) {
      return null;
    }
    return scan;
  }

  async listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Scan>> {
    const all = [...this.scans.values()]
      .filter((s) => s.orgId === orgId && s.repoId === repoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: all.slice(start, start + pagination.pageSize),
      total: all.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(orgId: string, id: string, status: ScanStatus): Promise<Scan> {
    const scan = this.scans.get(id);
    if (!scan || scan.orgId !== orgId) {
      throw new Error(`Scan not found: ${id}`);
    }
    scan.status = status;
    if (status === 'running' && scan.startedAt === undefined) {
      scan.startedAt = new Date();
    }
    if (
      (status === 'completed' || status === 'failed' || status === 'cancelled') &&
      scan.completedAt === undefined
    ) {
      scan.completedAt = new Date();
    }
    return scan;
  }

  async updateProgress(orgId: string, id: string, progress: ScanProgress): Promise<Scan> {
    const scan = this.scans.get(id);
    if (!scan || scan.orgId !== orgId) {
      throw new Error(`Scan not found: ${id}`);
    }
    if (progress.pluginsTotal !== undefined) scan.pluginsTotal = progress.pluginsTotal;
    if (progress.pluginsCompleted !== undefined) scan.pluginsCompleted = progress.pluginsCompleted;
    if (progress.currentPluginId !== undefined) {
      if (progress.currentPluginId === null) {
        delete scan.currentPluginId;
      } else {
        scan.currentPluginId = progress.currentPluginId;
      }
    }
    return scan;
  }
}
