import type { PrismaClient } from '@prisma/client';
import type {
  CreateRepoInput,
  PaginatedResult,
  PaginationParams,
  Repo,
  RepoRepository,
} from '@cqp/core';
import { repoProviderFromDb, repoProviderToDb } from './mappers.js';

export class PrismaRepoRepository implements RepoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRepoInput): Promise<Repo> {
    const row = await this.prisma.repo.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        provider: repoProviderToDb(input.provider ?? 'local'),
        remoteUrl: input.remoteUrl ?? null,
        localPath: input.localPath ?? null,
        workerId: input.workerId ?? 'default',
        defaultBranch: input.defaultBranch ?? 'main',
      },
    });
    return this.toDomain(row);
  }

  async findById(orgId: string, id: string): Promise<Repo | null> {
    const row = await this.prisma.repo.findFirst({ where: { id, orgId } });
    return row ? this.toDomain(row) : null;
  }

  async list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<Repo>> {
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.repo.findMany({
        where: { orgId },
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.repo.count({ where: { orgId } }),
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
    name: string;
    provider: Parameters<typeof repoProviderFromDb>[0];
    remoteUrl: string | null;
    localPath: string | null;
    workerId: string;
    defaultBranch: string;
    createdAt: Date;
  }): Repo {
    return {
      id: row.id,
      orgId: row.orgId,
      name: row.name,
      provider: repoProviderFromDb(row.provider),
      workerId: row.workerId,
      defaultBranch: row.defaultBranch,
      createdAt: row.createdAt,
      ...(row.remoteUrl !== null ? { remoteUrl: row.remoteUrl } : {}),
      ...(row.localPath !== null ? { localPath: row.localPath } : {}),
    };
  }
}
