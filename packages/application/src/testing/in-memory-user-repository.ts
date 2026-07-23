import { randomUUID } from 'node:crypto';
import type { CreateUserInput, User, UserRepository } from '@cqp/core';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: randomUUID(),
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      role: input.role ?? 'member',
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
}
