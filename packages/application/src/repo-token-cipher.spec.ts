import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptRepoToken,
  encryptRepoToken,
  parseRepoTokenEncryptionKey,
  RepoTokenDecryptionError,
} from './repo-token-cipher.js';

const KEY = randomBytes(32);

describe('encryptRepoToken / decryptRepoToken', () => {
  it('round-trips a real-looking PAT', () => {
    const raw = 'ghp_realisticLookingToken1234567890abcdef';
    const encrypted = encryptRepoToken(raw, KEY);

    expect(encrypted).not.toContain(raw);
    expect(decryptRepoToken(encrypted, KEY)).toBe(raw);
  });

  it('never produces the same ciphertext twice for the same input (random IV per call)', () => {
    const raw = 'ghp_sametoken';
    expect(encryptRepoToken(raw, KEY)).not.toBe(encryptRepoToken(raw, KEY));
  });

  it('throws RepoTokenDecryptionError when decrypted with the wrong key', () => {
    const encrypted = encryptRepoToken('ghp_secret', KEY);
    const wrongKey = randomBytes(32);

    expect(() => decryptRepoToken(encrypted, wrongKey)).toThrow(RepoTokenDecryptionError);
  });

  it('throws RepoTokenDecryptionError if the ciphertext was tampered with (GCM auth tag check)', () => {
    const encrypted = encryptRepoToken('ghp_secret', KEY);
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const tamperedCiphertext = Buffer.from(ciphertext!, 'base64');
    tamperedCiphertext[0] = (tamperedCiphertext[0]! ^ 0xff) & 0xff;
    const tampered = [iv, authTag, tamperedCiphertext.toString('base64')].join('.');

    expect(() => decryptRepoToken(tampered, KEY)).toThrow(RepoTokenDecryptionError);
  });

  it('throws RepoTokenDecryptionError on malformed input (wrong number of segments)', () => {
    expect(() => decryptRepoToken('not-a-real-ciphertext', KEY)).toThrow(RepoTokenDecryptionError);
  });
});

describe('parseRepoTokenEncryptionKey', () => {
  it('accepts a base64 string that decodes to exactly 32 bytes', () => {
    const key = parseRepoTokenEncryptionKey(randomBytes(32).toString('base64'));
    expect(key).toHaveLength(32);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => parseRepoTokenEncryptionKey(randomBytes(16).toString('base64'))).toThrow(
      /exactly 32 bytes/,
    );
  });
});
