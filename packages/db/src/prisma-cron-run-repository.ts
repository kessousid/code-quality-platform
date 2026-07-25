import type { PrismaClient } from '@prisma/client';
import type {
  CompleteCronRunInput,
  CreateCronRunInput,
  CronRun,
  CronRunRepository,
  PaginatedResult,
  PaginationParams,
} from '@cqp/core';
import {
  cronEnvironmentFromDb,
  cronEnvironmentToDb,
  cronRunStatusFromDb,
  cronRunStatusToDb,
} from './mappers.js';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0033).
 */
export class PrismaCronRunRepository implements CronRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateCronRunInput): Promise<CronRun> {
    const row = await this.prisma.cronRun.create({
      data: {
        orgId: input.orgId,
        cronId: input.cronId,
        cronName: input.cronName,
        environment: cronEnvironmentToDb(input.environment),
        triggeredByUserId: input.triggeredByUserId ?? null,
      },
    });
    return this.toDomain(row);
  }

  async complete(orgId: string, id: string, input: CompleteCronRunInput): Promise<CronRun> {
    const existing = await this.prisma.cronRun.findFirst({ where: { id, orgId } });
    if (!existing) {
      // TriggerCronRunUseCase already created this row moments earlier via
      // this same repository — reaching here means it vanished between
      // calls, a bug/race to surface loudly, not a normal not-found case.
      throw new Error(`CronRun not found: ${id}`);
    }

    const row = await this.prisma.cronRun.update({
      where: { id },
      data: {
        status: cronRunStatusToDb(input.status),
        statusCode: input.statusCode ?? null,
        responseBody: input.responseBody ?? null,
        errorMessage: input.errorMessage ?? null,
        ...(existing.completedAt === null ? { completedAt: new Date() } : {}),
      },
    });
    return this.toDomain(row);
  }

  async list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<CronRun>> {
    const where = { orgId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cronRun.findMany({
        where,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cronRun.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDomain(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    cronId: string;
    cronName: string;
    environment: Parameters<typeof cronEnvironmentFromDb>[0];
    status: Parameters<typeof cronRunStatusFromDb>[0];
    statusCode: number | null;
    responseBody: string | null;
    errorMessage: string | null;
    triggeredByUserId: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): CronRun {
    return {
      id: row.id,
      orgId: row.orgId,
      cronId: row.cronId,
      cronName: row.cronName,
      environment: cronEnvironmentFromDb(row.environment),
      status: cronRunStatusFromDb(row.status),
      createdAt: row.createdAt,
      ...(row.statusCode !== null ? { statusCode: row.statusCode } : {}),
      ...(row.responseBody !== null ? { responseBody: row.responseBody } : {}),
      ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
      ...(row.triggeredByUserId !== null ? { triggeredByUserId: row.triggeredByUserId } : {}),
      ...(row.completedAt !== null ? { completedAt: row.completedAt } : {}),
    };
  }
}
