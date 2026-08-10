import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // standard GCM nonce size

export class RepoTokenDecryptionError extends Error {
  constructor() {
    super('Failed to decrypt repo access token — wrong key or corrupted/tampered ciphertext.');
    this.name = 'RepoTokenDecryptionError';
  }
}

/**
 * AES-256-GCM encrypt-at-rest for a repo's PAT (docs/adr/0047) — the only
 * place in this codebase that needs a genuinely retrievable secret, unlike
 * `ApiToken`'s one-way hash (never retrievable) or the Gemini API key
 * override's never-persisted-at-all approach (both wrong shapes for a
 * token that must be decrypted server-side to actually clone a repo).
 * `key` is an explicit parameter, not read from `process.env` here, so
 * this stays a pure, trivially-testable function — the real env var
 * (`REPO_TOKEN_ENCRYPTION_KEY`) is read once at each composition root
 * (apps/api, apps/worker) via `parseRepoTokenEncryptionKey` below.
 */
export function encryptRepoToken(raw: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join('.');
}

export function decryptRepoToken(encrypted: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split('.');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new RepoTokenDecryptionError();
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf-8');
  } catch {
    // GCM's auth tag check throws on any tamper or wrong key — collapsed
    // into one error type so a caller never has to distinguish "wrong
    // key" from "corrupted data" (neither is recoverable).
    throw new RepoTokenDecryptionError();
  }
}

/** `REPO_TOKEN_ENCRYPTION_KEY` must be a base64 string decoding to exactly 32 bytes (AES-256's key size). */
export function parseRepoTokenEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `REPO_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256, got ${key.length}.`,
    );
  }
  return key;
}
