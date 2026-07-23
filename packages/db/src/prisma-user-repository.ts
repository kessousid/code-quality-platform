import type { PrismaClient } from '@prisma/client';
import type { CreateUserInput, User, UserRepository } from '@cqp/core';
import { userRoleFromDb, userRoleToDb } from './mappers.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        orgId: input.orgId,
        email: input.email,
        name: input.name,
        role: userRoleToDb(input.role ?? 'member'),
      },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: Parameters<typeof userRoleFromDb>[0];
    createdAt: Date;
  }): User {
    return {
      id: row.id,
      orgId: row.orgId,
      email: row.email,
      name: row.name,
      role: userRoleFromDb(row.role),
      createdAt: row.createdAt,
    };
  }
}
