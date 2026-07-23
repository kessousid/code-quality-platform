import { randomUUID } from 'node:crypto';
import type { CreateOrgInput, Org, OrgRepository } from '@cqp/core';

export class InMemoryOrgRepository implements OrgRepository {
  private readonly orgs = new Map<string, Org>();

  async findBySlug(slug: string): Promise<Org | null> {
    return [...this.orgs.values()].find((o) => o.slug === slug) ?? null;
  }

  async create(input: CreateOrgInput): Promise<Org> {
    const org: Org = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      createdAt: new Date(),
    };
    this.orgs.set(org.id, org);
    return org;
  }
}
