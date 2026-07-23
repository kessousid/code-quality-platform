/**
 * Domain type + repository port for Scan (see docs/adr/0010). Plain TS,
 * no Prisma, no NestJS — packages/db implements ScanRepository against the
 * real database; packages/application's use cases depend only on this
 * interface.
 */
import type { AnalysisCategory } from './finding.js';
import type { PaginatedResult, PaginationParams } from './pagination.js';

export type ScanMode = 'full' | 'incremental';

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanProgress {
  pluginsTotal?: number;
  pluginsCompleted?: number;
  currentPluginId?: string | null;
}

export interface Scan {
  id: string;
  orgId: string;
  repoId: string;
  ref: string;
  mode: ScanMode;
  status: ScanStatus;
  /** Empty/absent means "run every applicable plugin" (see docs/adr/0023). */
  categories?: AnalysisCategory[];
  baseScanId?: string;
  triggeredByUserId?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  pluginsTotal?: number;
  pluginsCompleted?: number;
  currentPluginId?: string;
}

export interface CreateScanInput {
  orgId: string;
  repoId: string;
  ref: string;
  mode: ScanMode;
  categories?: AnalysisCategory[];
  baseScanId?: string;
  triggeredByUserId?: string;
}

export interface ScanRepository {
  create(input: CreateScanInput): Promise<Scan>;
  findById(orgId: string, id: string): Promise<Scan | null>;
  /** Newest first — powers the dashboard's scan history / trends view (Phase 10). */
  listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Scan>>;
  /**
   * Drives the worker's status lifecycle (see docs/adr/0021): stamps
   * `startedAt` on the transition into `running`, `completedAt` on the
   * transition into `completed`, `failed`, or `cancelled`. Idempotent
   * re-transitions (e.g. a retried job re-setting `running`) don't
   * overwrite an already-set timestamp.
   */
  updateStatus(orgId: string, id: string, status: ScanStatus): Promise<Scan>;
  /**
   * Live progress while `running` (see docs/adr/0023) — fired once per
   * plugin start/finish, polled by the frontend via GET /scans/:id. Never
   * throws on a missing scan; a progress update racing a scan's deletion
   * is not worth failing the whole scan over.
   */
  updateProgress(orgId: string, id: string, progress: ScanProgress): Promise<Scan>;
}
