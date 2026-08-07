import bcrypt from 'bcryptjs';

/**
 * Mirrors api-token-hash.ts's "hashing happens in exactly one shared
 * place" shape, but a real password needs a salted, adaptive KDF —
 * `sha256` (right for an opaque random API token, ADR-0014) is wrong
 * here, since a password is human-chosen and guessable. `bcryptjs` is
 * pure JS (no native build step, unlike `bcrypt`/`argon2`), which matters
 * in this repo's multi-stage Docker builds — see docs/adr/0041.
 */
const SALT_ROUNDS = 12;

export function hashPassword(rawPassword: string): Promise<string> {
  return bcrypt.hash(rawPassword, SALT_ROUNDS);
}

export function verifyPassword(rawPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(rawPassword, passwordHash);
}
