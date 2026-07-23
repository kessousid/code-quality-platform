/**
 * Sole credential type for MVP (see docs/adr/0014-auth-model.md). The
 * repository never sees a raw token — only a pre-computed hash — so a
 * hashing algorithm choice is an apps/api concern, not a domain one.
 */

export interface ApiTokenValidationResult {
  tokenId: string;
  orgId: string;
}

export interface CreateApiTokenInput {
  orgId: string;
  name: string;
  tokenHash: string;
}

export interface ApiTokenRepository {
  create(input: CreateApiTokenInput): Promise<{ id: string }>;
  /** Returns null if the hash doesn't match any token, or matches a revoked one. */
  findActiveByHash(tokenHash: string): Promise<ApiTokenValidationResult | null>;
  touchLastUsed(tokenId: string): Promise<void>;
  /**
   * Revokes every active token with this exact `(orgId, name)` pair. Used
   * by email login (docs/adr/0022) to invalidate a user's previous token
   * before issuing a fresh one — `ApiToken` only ever stores a hash, so
   * a prior login's raw value was never retrievable again anyway.
   */
  revokeAllByName(orgId: string, name: string): Promise<void>;
}
