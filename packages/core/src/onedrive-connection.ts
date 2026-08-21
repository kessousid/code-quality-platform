/**
 * Domain type + repository port for a personal OneDrive connection (one
 * per org) — see docs on the "save QA reports to OneDrive" feature.
 * A delegated OAuth connection, not app-only: personal Microsoft accounts
 * don't support the client-credentials flow, so this stores a refresh
 * token (encrypted at rest, same cipher as Repo.encryptedAccessToken)
 * rather than any kind of service credential.
 */
export interface OneDriveConnection {
  orgId: string;
  encryptedRefreshToken: string;
  /** The signed-in Microsoft account's email, purely for display — never used for auth. */
  accountEmail?: string;
  updatedAt: Date;
}

export interface OneDriveConnectionRepository {
  /** Creates or replaces the single connection row for this org. */
  upsert(
    orgId: string,
    encryptedRefreshToken: string,
    accountEmail?: string,
  ): Promise<OneDriveConnection>;
  find(orgId: string): Promise<OneDriveConnection | null>;
}
