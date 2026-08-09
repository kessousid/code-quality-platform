import { randomUUID } from 'node:crypto';
import type {
  CompleteQaAutomationRunInput,
  CreateQaAutomationRunInput,
  PaginatedResult,
  PaginationParams,
  QaAutomationEnvironment,
  QaAutomationRun,
  QaAutomationRunRepository,
} from '@cqp/core';

/** Test double mirroring InMemoryCronRunRepository's create/status-transition shape. */
export class InMemoryQaAutomationRunRepository implements QaAutomationRunRepository {
  private readonly runs = new Map<string, QaAutomationRun>();

  async create(input: CreateQaAutomationRunInput): Promise<QaAutomationRun> {
    const run: QaAutomationRun = {
      id: randomUUID(),
      orgId: input.orgId,
      environment: input.environment,
      status: 'running',
      triggeredBy: input.triggeredBy,
      startedAt: new Date(),
      createdAt: new Date(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async findById(orgId: string, id: string): Promise<QaAutomationRun | null> {
    const run = this.runs.get(id);
    return run && run.orgId === orgId ? run : null;
  }

  async list(
    orgId: string,
    pagination: PaginationParams,
    environment?: QaAutomationEnvironment,
  ): Promise<PaginatedResult<QaAutomationRun>> {
    const all = [...this.runs.values()]
      .filter((r) => r.orgId === orgId)
      .filter((r) => environment === undefined || r.environment === environment)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: all.slice(start, start + pagination.pageSize),
      total: all.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async complete(
    orgId: string,
    id: string,
    input: CompleteQaAutomationRunInput,
  ): Promise<QaAutomationRun> {
    const run = this.runs.get(id);
    if (!run || run.orgId !== orgId) {
      throw new Error(`QaAutomationRun not found: ${id}`);
    }
    run.status = input.status;
    if (run.completedAt === undefined) run.completedAt = new Date();
    return run;
  }

  async findAllRunning(): Promise<QaAutomationRun[]> {
    return [...this.runs.values()].filter((r) => r.status === 'running');
  }
}
