import type { OneDriveConnectionRepository } from '@cqp/core';
import {
  createOneDriveEditLink,
  ensureOneDriveFolder,
  refreshOneDriveAccessToken,
  uploadToOneDrive,
  type OneDriveAppConfig,
} from './onedrive-graph-client.js';
import { decryptRepoToken, encryptRepoToken } from './repo-token-cipher.js';

/**
 * Per the user: the OneDrive filename should carry a human-readable date
 * (a cuid run ID alone gives no sense of "when" once several reports
 * have accumulated in the same folder). Formatted in IST specifically
 * (not the container's own UTC clock) since that's the timezone every
 * schedule/cron in this codebase is already expressed in for the user's
 * benefit (docs/adr/0036, docs/adr/0042).
 */
export function formatOneDriveReportFilename(label: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const stamp = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}IST`;
  return `${label}-${stamp}.xlsx`;
}

/**
 * Orchestrates "upload this report to the org's connected OneDrive and
 * return a shareable edit link" for both RunQaAutomationSuiteUseCase and
 * RunStagingTestSuiteUseCase. A genuinely optional, best-effort side
 * feature -- there might be no connection for this org yet (feature never
 * set up), and any Graph failure (expired connection, network blip)
 * should never break the run itself or its email report, so every
 * failure path here is caught and logged, returning `undefined` rather
 * than throwing. Reuses repo-token-cipher's generic AES-256-GCM functions
 * (not actually repo-specific despite the name) rather than a duplicate
 * cipher, and the same `REPO_TOKEN_ENCRYPTION_KEY` -- one
 * encryption-at-rest key for this whole codebase's few
 * genuinely-retrievable secrets.
 *
 * Returns the edit link rather than sharing named per-person permissions
 * itself: confirmed live (2026-08-21) that Graph's `/invite` action
 * (OneDrive-for-Business-style named sharing) fails outright on a
 * personal OneDrive account. An "anyone with the link can edit" link,
 * included in the report email that already goes to exactly the people
 * who should have access, is the reliable mechanism personal OneDrive
 * actually supports -- see createOneDriveEditLink's own doc comment.
 */
export class OneDriveReportUploader {
  constructor(
    private readonly connectionRepository: OneDriveConnectionRepository,
    private readonly appConfig: OneDriveAppConfig,
    private readonly encryptionKey: Buffer,
    private readonly folderName: string,
  ) {}

  async upload(orgId: string, filename: string, content: Buffer): Promise<string | undefined> {
    try {
      const connection = await this.connectionRepository.find(orgId);
      if (!connection) return undefined; // Feature not connected for this org yet -- silent no-op, same as an unset optional env var elsewhere in this codebase.

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
      return await createOneDriveEditLink(refreshed.accessToken, uploaded.id);
    } catch (error) {
      console.error(`[onedrive] failed to upload/share report for org ${orgId}:`, error);
      return undefined;
    }
  }
}
