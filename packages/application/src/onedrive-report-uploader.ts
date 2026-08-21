import type { OneDriveConnectionRepository } from '@cqp/core';
import {
  ensureOneDriveFolder,
  refreshOneDriveAccessToken,
  shareOneDriveItem,
  uploadToOneDrive,
  type OneDriveAppConfig,
} from './onedrive-graph-client.js';
import { decryptRepoToken, encryptRepoToken } from './repo-token-cipher.js';

/**
 * `alertEmailTo`/`alertEmailCc` are plain env-var strings that Nodemailer
 * already accepts as comma-separated multi-recipient lists -- reused
 * as-is here so "share with those who are part of email" never needs its
 * own separately-maintained list.
 */
export function parseEmailListForSharing(...values: (string | undefined)[]): string[] {
  return values
    .flatMap((value) => value?.split(',') ?? [])
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

/**
 * Orchestrates "upload this report to the org's connected OneDrive and
 * share it with these emails" for both RunQaAutomationSuiteUseCase and
 * RunStagingTestSuiteUseCase. A genuinely optional, best-effort side
 * feature -- there might be no connection for this org yet (feature never
 * set up), and any Graph failure (expired connection, network blip)
 * should never break the run itself or its email report, so every
 * failure path here is caught and logged, never rethrown. Reuses
 * repo-token-cipher's generic AES-256-GCM functions (not actually
 * repo-specific despite the name) rather than a duplicate cipher, and the
 * same `REPO_TOKEN_ENCRYPTION_KEY` -- one encryption-at-rest key for this
 * whole codebase's few genuinely-retrievable secrets.
 */
export class OneDriveReportUploader {
  constructor(
    private readonly connectionRepository: OneDriveConnectionRepository,
    private readonly appConfig: OneDriveAppConfig,
    private readonly encryptionKey: Buffer,
    private readonly folderName: string,
  ) {}

  async uploadAndShare(
    orgId: string,
    filename: string,
    content: Buffer,
    shareWithEmails: string[],
  ): Promise<void> {
    try {
      const connection = await this.connectionRepository.find(orgId);
      if (!connection) return; // Feature not connected for this org yet -- silent no-op, same as an unset optional env var elsewhere in this codebase.

      const refreshToken = decryptRepoToken(connection.encryptedRefreshToken, this.encryptionKey);
      const refreshed = await refreshOneDriveAccessToken(this.appConfig, refreshToken);
      // Persist the rotated refresh token immediately, before the upload
      // itself -- if the upload below fails, the connection must still
      // stay usable for the next run rather than being left pointing at
      // a refresh token Microsoft has already invalidated.
      await this.connectionRepository.upsert(
        orgId,
        encryptRepoToken(refreshed.refreshToken, this.encryptionKey),
        connection.accountEmail,
      );

      await ensureOneDriveFolder(refreshed.accessToken, this.folderName);
      const uploaded = await uploadToOneDrive(
        refreshed.accessToken,
        this.folderName,
        filename,
        content,
      );
      await shareOneDriveItem(refreshed.accessToken, uploaded.id, shareWithEmails);
    } catch (error) {
      console.error(`[onedrive] failed to upload/share report for org ${orgId}:`, error);
    }
  }
}
