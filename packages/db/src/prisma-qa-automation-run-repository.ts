import type { PrismaClient } from '@prisma/client';
import type {
  CompleteQaAutomationRunInput,
  CreateQaAutomationRunInput,
  PaginatedResult,
  PaginationParams,
  QaAutomationEnvironment,
  QaAutomationRun,
  QaAutomationRunRepository,
} from '@cqp/core';
import {
  qaAutomationEnvironmentFromDb,
  qaAutomationEnvironmentToDb,
  qaAutomationRunStatusFromDb,
  qaAutomationRunStatusToDb,
  qaAutomationTriggerFromDb,
  qaAutomationTriggerToDb,
} from './mappers.js';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0035).
 */
export class PrismaQaAutomationRunRepository implements QaAutomationRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateQaAutomationRunInput): Promise<QaAutomationRun> {
    const row = await this.prisma.qaAutomationRun.create({
      data: {
        orgId: input.orgId,
        environment: qaAutomationEnvironmentToDb(input.environment),
        triggeredBy: qaAutomationTriggerToDb(input.triggeredBy),
      },
    });
    return this.toDomain(row);
  }

  async findById(orgId: string, id: string): Promise<QaAutomationRun | null> {
    const row = await this.prisma.qaAutomationRun.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async list(
    orgId: string,
    pagination: PaginationParams,
    environment?: QaAutomationEnvironment,
  ): Promise<PaginatedResult<QaAutomationRun>> {
    const where = {
      orgId,
      ...(environment !== undefined
        ? { environment: qaAutomationEnvironmentToDb(environment) }
        : {}),
    };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.qaAutomationRun.findMany({
        where,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.qaAutomationRun.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDomain(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async complete(
    orgId: string,
    id: string,
    input: CompleteQaAutomationRunInput,
  ): Promise<QaAutomationRun> {
    const existing = await this.prisma.qaAutomationRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      throw new Error(`QaAutomationRun not found: ${id}`);
    }

    const row = await this.prisma.qaAutomationRun.update({
      where: { id },
      data: {
        status: qaAutomationRunStatusToDb(input.status),
        ...(existing.completedAt === null ? { completedAt: new Date() } : {}),
      },
    });
    return this.toDomain(row);
  }

  async findAllRunning(): Promise<QaAutomationRun[]> {
    const rows = await this.prisma.qaAutomationRun.findMany({
      where: { status: qaAutomationRunStatusToDb('running') },
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    environment: Parameters<typeof qaAutomationEnvironmentFromDb>[0];
    status: Parameters<typeof qaAutomationRunStatusFromDb>[0];
    triggeredBy: Parameters<typeof qaAutomationTriggerFromDb>[0];
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
  }): QaAutomationRun {
    return {
      id: row.id,
      orgId: row.orgId,
      environment: qaAutomationEnvironmentFromDb(row.environment),
      status: qaAutomationRunStatusFromDb(row.status),
      triggeredBy: qaAutomationTriggerFromDb(row.triggeredBy),
      startedAt: row.startedAt,
      createdAt: row.createdAt,
      ...(row.completedAt !== null ? { completedAt: row.completedAt } : {}),
    };
  }
}
