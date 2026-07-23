import { createHash } from 'node:crypto';

/**
 * Shared by ValidateApiTokenUseCase and CreateApiTokenUseCase so hashing
 * happens in exactly one place — see docs/adr/0014-auth-model.md. Uses
 * Node's built-in crypto, not a framework, so this stays in the
 * application layer rather than moving to apps/api.
 */
export function hashApiToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
