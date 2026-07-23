import type { PrismaClient } from '@prisma/client';
import type { CreateOrgInput, Org, OrgRepository } from '@cqp/core';

export class PrismaOrgRepository implements OrgRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<Org | null> {
    const row = await this.prisma.org.findUnique({ where: { slug } });
    return row ? this.toDomain(row) : null;
  }

  async create(input: CreateOrgInput): Promise<Org> {
    const row = await this.prisma.org.create({ data: { name: input.name, slug: input.slug } });
    return this.toDomain(row);
  }

  private toDomain(row: { id: string; name: string; slug: string; createdAt: Date }): Org {
    return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt };
  }
}
