import type { PrismaClient } from '@prisma/client';
import type { CreateUserInput, User, UserRepository } from '@cqp/core';
import { userRoleFromDb, userRoleToDb, userStatusFromDb, userStatusToDb } from './mappers.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        orgId: input.orgId,
        email: input.email,
        name: input.name,
        role: userRoleToDb(input.role ?? 'member'),
        status: userStatusToDb(input.status ?? 'active'),
        ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
      },
    });
    return this.toDomain(row);
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    const row = await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return this.toDomain(row);
  }

  async activate(id: string): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id },
      data: { status: userStatusToDb('active') },
    });
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: Parameters<typeof userRoleFromDb>[0];
    passwordHash: string | null;
    status: Parameters<typeof userStatusFromDb>[0];
    createdAt: Date;
  }): User {
    return {
      id: row.id,
      orgId: row.orgId,
      email: row.email,
      name: row.name,
      role: userRoleFromDb(row.role),
      status: userStatusFromDb(row.status),
      ...(row.passwordHash !== null ? { passwordHash: row.passwordHash } : {}),
      createdAt: row.createdAt,
    };
  }
}
