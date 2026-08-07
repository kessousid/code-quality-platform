/**
 * A short-lived, single-use, emailed bearer secret (see docs/adr/0041) —
 * covers both "verify your email" (signup) and "reset your password"
 * (forgot password) links with one shape, since both are structurally
 * identical: mint a random token, email its raw form as a link, store
 * only a hash, consume it exactly once before it expires. Mirrors
 * `ApiToken`'s own "repository never sees a raw value" discipline
 * (docs/adr/0014).
 */
export type AuthTokenPurpose = 'email_verification' | 'password_reset';

export interface AuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface CreateAuthTokenInput {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthTokenRepository {
  create(input: CreateAuthTokenInput): Promise<AuthToken>;
  /** Returns null if the hash doesn't match, is for a different purpose, is already used, or has expired. */
  findActiveByHash(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthToken | null>;
  markUsed(id: string): Promise<void>;
  /**
   * Invalidates every not-yet-used token of this purpose for this user
   * before issuing a new one — an old, still-unclicked reset/verification
   * link should stop working the moment a fresh one is requested, not
   * remain a second valid way in.
   */
  invalidateAllForUser(userId: string, purpose: AuthTokenPurpose): Promise<void>;
}
