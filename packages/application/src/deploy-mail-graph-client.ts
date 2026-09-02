/**
 * Thin wrapper around Microsoft Graph's REST API for reading a shared
 * mailbox's recent messages (docs/adr/0058: trigger production QA
 * automation from a deploy-notification email) — deliberately plain
 * `fetch` calls, same reasoning as onedrive-graph-client.ts: the surface
 * needed here (one token fetch, one message list) is too small for a real
 * SDK dependency to earn its weight.
 *
 * Unlike the OneDrive integration, this uses the app-only client-credentials
 * OAuth flow, not a delegated user login — there's no human signing in, no
 * refresh token, and no per-org stored connection. A fresh access token is
 * fetched on every poll; at an hourly cadence, caching the ~1h-lived token
 * across polls isn't worth the added complexity.
 */
export class DeployMailGraphError extends Error {
  constructor(step: string, status: number, body: string) {
    super(`Deploy-mail Graph ${step} failed (HTTP ${status}): ${body}`);
    this.name = 'DeployMailGraphError';
  }
}

export interface DeployMailAppConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Tenant-specific token endpoint (not `/common/` — that's only valid for
 * multi-audience app registrations like the OneDrive app's; client-credentials
 * requires a specific tenant) and the `.default` scope, which requests
 * whatever application permissions were admin-consented on the app
 * registration (here: Mail.Read, scoped to one mailbox via an Exchange
 * application access policy) rather than a delegated permission string.
 */
export async function fetchDeployMailAccessToken(config: DeployMailAppConfig): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
    },
  );
  if (!response.ok) {
    throw new DeployMailGraphError('token fetch', response.status, await response.text());
  }
  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}

export interface DeployMailMessage {
  id: string;
  receivedDateTime: string;
  /** Plain text, not HTML -- see the `Prefer` header below. */
  bodyText: string;
}

/**
 * `Prefer: outlook.body-content-type="text"` makes Graph return
 * `body.content` as already-converted plain text instead of HTML, so
 * matching a distinctive line in the email body doesn't need any
 * HTML-stripping code of our own.
 */
export async function listRecentDeployMails(
  accessToken: string,
  mailbox: string,
  sinceIso: string,
): Promise<DeployMailMessage[]> {
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${sinceIso}`,
    $orderby: 'receivedDateTime asc',
    $select: 'id,receivedDateTime,body',
    $top: '25',
  });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    },
  );
  if (!response.ok) {
    throw new DeployMailGraphError('message list', response.status, await response.text());
  }
  const json = (await response.json()) as {
    value: { id: string; receivedDateTime: string; body?: { content?: string } }[];
  };
  return json.value.map((m) => ({
    id: m.id,
    receivedDateTime: m.receivedDateTime,
    bodyText: m.body?.content ?? '',
  }));
}
