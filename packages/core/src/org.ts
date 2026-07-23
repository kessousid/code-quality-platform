/** First-class domain type as of docs/adr/0022 — previously `Org` was Prisma-only, touched directly by the bootstrap script, never modeled as a port. */
export interface Org {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
}

export interface OrgRepository {
  findBySlug(slug: string): Promise<Org | null>;
  create(input: CreateOrgInput): Promise<Org>;
}
