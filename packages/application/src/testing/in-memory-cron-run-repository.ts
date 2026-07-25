import { randomUUID } from 'node:crypto';
import type {
  CompleteCronRunInput,
  CreateCronRunInput,
  CronRun,
  CronRunRepository,
  PaginatedResult,
  PaginationParams,
} from '@cqp/core';

/** Test double mirroring InMemoryScanRepository's create/status-transition shape. */
export class InMemoryCronRunRepository implements CronRunRepository {
  private readonly runs = new Map<string, CronRun>();

  async create(input: CreateCronRunInput): Promise<CronRun> {
    const run: CronRun = {
      id: randomUUID(),
      orgId: input.orgId,
      cronId: input.cronId,
      cronName: input.cronName,
      environment: input.environment,
      status: 'running',
      createdAt: new Date(),
      ...(input.triggeredByUserId !== undefined
        ? { triggeredByUserId: input.triggeredByUserId }
        : {}),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async complete(orgId: string, id: string, input: CompleteCronRunInput): Promise<CronRun> {
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      throw new Error(`CronRun not found: ${id}`);
    }
    run.status = input.status;
    if (input.statusCode !== undefined) run.statusCode = input.statusCode;
    if (input.responseBody !== undefined) run.responseBody = input.responseBody;
    if (input.errorMessage !== undefined) run.errorMessage = input.errorMessage;
    if (run.completedAt === undefined) run.completedAt = new Date();
    return run;
  }

  async list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<CronRun>> {
    const all = [...this.runs.values()]
      .filter((r) => r.orgId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: all.slice(start, start + pagination.pageSize),
      total: all.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
