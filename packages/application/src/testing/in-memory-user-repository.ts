import { randomUUID } from 'node:crypto';
import type { CreateUserInput, User, UserRepository } from '@cqp/core';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: randomUUID(),
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      role: input.role ?? 'member',
      status: input.status ?? 'active',
      ...(input.passwordHash !== undefined ? { passwordHash: input.passwordHash } : {}),
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updatePassword(id: string, passwordHash: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User not found: ${id}`);
    user.passwordHash = passwordHash;
    return user;
  }

  async activate(id: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User not found: ${id}`);
    user.status = 'active';
    return user;
  }
}
