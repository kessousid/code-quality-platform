import { randomUUID } from 'node:crypto';
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

/** Mirrors InMemoryUnitTestRunRepository's shape exactly (docs/adr/0021, docs/adr/0025) — same reasoning. */
export class InMemoryCoverageRunRepository implements CoverageRunRepository {
  private readonly runs = new Map<string, CoverageRun>();

  async create(input: CreateCoverageRunInput & { baseRef: string }): Promise<CoverageRun> {
    const run: CoverageRun = {
      id: randomUUID(),
      orgId: input.orgId,
      repoId: input.repoId,
      baseRef: input.baseRef,
      status: 'queued',
      createdAt: new Date(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async findById(orgId: string, id: string): Promise<CoverageRun | null> {
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      return null;
    }
    return run;
  }

  async listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CoverageRun>> {
    const all = [...this.runs.values()]
      .filter((r) => r.orgId === orgId && r.repoId === repoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: all.slice(start, start + pagination.pageSize),
      total: all.length,
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
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      throw new Error(`CoverageRun not found: ${id}`);
    }
    run.status = status;
    if (status === 'running' && run.startedAt === undefined) {
      run.startedAt = new Date();
    }
    if (
      (status === 'completed' || status === 'failed' || status === 'cancelled') &&
      run.completedAt === undefined
    ) {
      run.completedAt = new Date();
    }
    if (errorMessage !== undefined) {
      run.errorMessage = errorMessage;
    }
    return run;
  }

  async updateProgress(
    orgId: string,
    id: string,
    progress: CoverageRunProgress,
  ): Promise<CoverageRun> {
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      throw new Error(`CoverageRun not found: ${id}`);
    }
    if (progress.filesTotal !== undefined) run.filesTotal = progress.filesTotal;
    if (progress.filesCompleted !== undefined) run.filesCompleted = progress.filesCompleted;
    if (progress.currentFilePath !== undefined) {
      if (progress.currentFilePath === null) {
        delete run.currentFilePath;
      } else {
        run.currentFilePath = progress.currentFilePath;
      }
    }
    return run;
  }

  async updateResultsSummary(
    orgId: string,
    id: string,
    summary: CoverageRunResultsSummary,
  ): Promise<CoverageRun> {
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      throw new Error(`CoverageRun not found: ${id}`);
    }
    run.testsTotal = summary.testsTotal;
    run.testsPassed = summary.testsPassed;
    run.testsFailed = summary.testsFailed;
    run.changedLinesTotal = summary.changedLinesTotal;
    run.uncoveredLinesTotal = summary.uncoveredLinesTotal;
    run.gatePassed = summary.gatePassed;
    return run;
  }
}
