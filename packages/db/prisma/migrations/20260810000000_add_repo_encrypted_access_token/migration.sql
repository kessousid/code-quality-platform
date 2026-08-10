-- A github/gitlab repo needs a PAT to clone private code. Stored as
-- opaque AES-256-GCM ciphertext, never plaintext (docs/adr/0047).
ALTER TABLE "repos" ADD COLUMN "encryptedAccessToken" TEXT;
