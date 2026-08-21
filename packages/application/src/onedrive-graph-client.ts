/**
 * Thin wrapper around Microsoft Graph's REST API for a personal OneDrive
 * connection (docs: "save QA reports to OneDrive" feature) — deliberately
 * plain `fetch` calls rather than the `@microsoft/microsoft-graph-client`
 * SDK, since the surface needed here (token exchange/refresh, one file
 * upload, one sharing call) is small enough that a real SDK dependency
 * wouldn't earn its weight.
 *
 * Personal Microsoft accounts don't support the app-only (client
 * credentials) OAuth flow at all — only a delegated flow works, which is
 * why every call here needs a real access token obtained via a one-time
 * user login (`exchangeOneDriveAuthCode`) and kept alive via
 * `refreshOneDriveAccessToken`. Personal-account refresh tokens rotate on
 * every use, so every token response includes a NEW refresh token that
 * the caller must persist -- reusing a stale one fails with invalid_grant.
 */
export class OneDriveGraphError extends Error {
  constructor(step: string, status: number, body: string) {
    super(`OneDrive ${step} failed (HTTP ${status}): ${body}`);
    this.name = 'OneDriveGraphError';
  }
}

export interface OneDriveAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OneDriveTokenResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Confirmed live (2026-08-21): `/consumers/` is only correct for an app
 * whose Entra "Supported account types" is "Personal Microsoft accounts"
 * only (signInAudience `PersonalMicrosoftAccount`). This app is
 * registered as "Any Entra ID Tenant + Personal Microsoft accounts"
 * (`AzureADandPersonalMicrosoftAccount`), which Microsoft's own docs
 * require using `/common/` for -- `/consumers/` returned a bare
 * `error=server_error` with no description for that combination.
 */
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const GRAPH_SCOPE = 'Files.ReadWrite offline_access';

/** The one-time URL the user visits in their browser to grant this app access to their OneDrive. */
export function buildOneDriveAuthorizeUrl(config: OneDriveAppConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: GRAPH_SCOPE,
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

async function requestToken(
  config: OneDriveAppConfig,
  body: Record<string, string>,
  step: string,
): Promise<OneDriveTokenResult> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: GRAPH_SCOPE,
      ...body,
    }).toString(),
  });
  if (!response.ok) {
    throw new OneDriveGraphError(step, response.status, await response.text());
  }
  const json = (await response.json()) as { access_token: string; refresh_token: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

/** The one-time exchange right after the user completes the browser login (the `/onedrive/callback` redirect). */
export function exchangeOneDriveAuthCode(
  config: OneDriveAppConfig,
  code: string,
): Promise<OneDriveTokenResult> {
  return requestToken(
    config,
    { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri },
    'authorization code exchange',
  );
}

/** Called before every upload -- access tokens are short-lived (~1h), refresh tokens are the durable credential. */
export function refreshOneDriveAccessToken(
  config: OneDriveAppConfig,
  refreshToken: string,
): Promise<OneDriveTokenResult> {
  return requestToken(
    config,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    'token refresh',
  );
}

/** The signed-in account's email, purely for a human-readable "connected as ..." display. */
export async function fetchOneDriveAccountEmail(accessToken: string): Promise<string | undefined> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return undefined;
  const json = (await response.json()) as { userPrincipalName?: string; mail?: string };
  return json.mail ?? json.userPrincipalName;
}

/** Idempotent -- a 409 (already exists) is treated as success, not an error. */
export async function ensureOneDriveFolder(accessToken: string, folderName: string): Promise<void> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
  if (response.ok || response.status === 409) return;
  throw new OneDriveGraphError('folder creation', response.status, await response.text());
}

export interface OneDriveUploadedFile {
  id: string;
  webUrl: string;
}

/** Simple (non-resumable) upload -- fine for report files, which are consistently well under Graph's 4MB simple-upload ceiling. */
export async function uploadToOneDrive(
  accessToken: string,
  folderName: string,
  filename: string,
  content: Buffer,
): Promise<OneDriveUploadedFile> {
  const path = encodeURIComponent(`${folderName}/${filename}`).replace(/%2F/g, '/');
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: content,
  });
  if (!response.ok) {
    throw new OneDriveGraphError('file upload', response.status, await response.text());
  }
  const json = (await response.json()) as { id: string; webUrl: string };
  return { id: json.id, webUrl: json.webUrl };
}

/** Grants edit access to a list of emails -- personal OneDrive's equivalent of "share with write permission". */
export async function shareOneDriveItem(
  accessToken: string,
  itemId: string,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) return;
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipients: emails.map((email) => ({ email })),
      message: 'QA Automation report',
      requireSignIn: false,
      sendInvitation: true,
      roles: ['write'],
    }),
  });
  if (!response.ok) {
    throw new OneDriveGraphError('sharing', response.status, await response.text());
  }
}
