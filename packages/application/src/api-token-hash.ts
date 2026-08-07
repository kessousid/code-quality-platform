import { createHash } from 'node:crypto';

/**
 * Shared by ValidateApiTokenUseCase and CreateApiTokenUseCase so hashing
 * happens in exactly one place — see docs/adr/0014-auth-model.md. Uses
 * Node's built-in crypto, not a framework, so this stays in the
 * application layer rather than moving to apps/api. Also reused for
 * AuthToken (email verification / password reset, docs/adr/0041) —
 * the same "opaque random bearer secret, only its hash is ever stored"
 * shape applies identically; unsuitable for a human-chosen password,
 * which needs password-hash.ts's salted, adaptive hash instead.
 */
export function hashApiToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
