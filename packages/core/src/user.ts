/** See docs/adr/0022 — the first real per-person identity in this platform (previously only `ApiToken`, scoped to an org, not a person). */
export type UserRole = 'owner' | 'admin' | 'member';

/**
 * See docs/adr/0041 — replaces ADR-0022's passwordless, no-verification
 * login. `pending_verification` means signed up but hasn't clicked the
 * emailed verification link yet; login is refused until `active`.
 */
export type UserStatus = 'pending_verification' | 'active';

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * Never populated for a user created by the old email-only login
   * (ADR-0022) — those accounts are grandfathered in as `active` (see
   * `status`) but have no password until they go through "Forgot
   * Password" once, which doubles as their migration path (docs/adr/0041).
   */
  passwordHash?: string;
  status: UserStatus;
  createdAt: Date;
}

export interface CreateUserInput {
  orgId: string;
  email: string;
  name: string;
  role?: UserRole;
  passwordHash?: string;
  /** Defaults to 'active' when omitted — the old email-only login path and any other non-signup caller never wants a pending account. */
  status?: UserStatus;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  /** Also used by the "Forgot Password" flow to give a legacy (no-password) account its first password — see docs/adr/0041. */
  updatePassword(id: string, passwordHash: string): Promise<User>;
  /** Marks a pending_verification account active. A no-op (still succeeds) if already active. */
  activate(id: string): Promise<User>;
}
