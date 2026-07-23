/** See docs/adr/0022 — the first real per-person identity in this platform (previously only `ApiToken`, scoped to an org, not a person). */
export type UserRole = 'owner' | 'admin' | 'member';

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export interface CreateUserInput {
  orgId: string;
  email: string;
  name: string;
  role?: UserRole;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
