import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeployMailGraphError,
  fetchDeployMailAccessToken,
  listRecentDeployMails,
} from './deploy-mail-graph-client.js';

const CONFIG = { tenantId: 'tenant_1', clientId: 'client_1', clientSecret: 'secret_1' };

describe('deploy-mail-graph-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchDeployMailAccessToken', () => {
    it('posts a client-credentials grant to the tenant-specific token endpoint', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'token_abc' }), { status: 200 }),
      );

      const token = await fetchDeployMailAccessToken(CONFIG);

      expect(token).toBe('token_abc');
      const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
      expect(url).toBe('https://login.microsoftonline.com/tenant_1/oauth2/v2.0/token');
      const body = new URLSearchParams(init!.body as string);
      expect(body.get('client_id')).toBe('client_1');
      expect(body.get('client_secret')).toBe('secret_1');
      expect(body.get('scope')).toBe('https://graph.microsoft.com/.default');
      expect(body.get('grant_type')).toBe('client_credentials');
    });

    it('throws DeployMailGraphError on a non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue(new Response('invalid_client', { status: 401 }));

      await expect(fetchDeployMailAccessToken(CONFIG)).rejects.toThrow(DeployMailGraphError);
    });
  });

  describe('listRecentDeployMails', () => {
    it('requests plain-text bodies and maps the response', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            value: [
              {
                id: 'm1',
                receivedDateTime: '2026-09-01T10:00:00Z',
                body: { content: 'Deploy succeeded' },
              },
              { id: 'm2', receivedDateTime: '2026-09-01T11:00:00Z' },
            ],
          }),
          { status: 200 },
        ),
      );

      const messages = await listRecentDeployMails(
        'token_abc',
        'deploys@example.com',
        '2026-09-01T00:00:00.000Z',
      );

      expect(messages).toEqual([
        { id: 'm1', receivedDateTime: '2026-09-01T10:00:00Z', bodyText: 'Deploy succeeded' },
        { id: 'm2', receivedDateTime: '2026-09-01T11:00:00Z', bodyText: '' },
      ]);
      const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
      expect(url).toContain('/v1.0/users/deploys%40example.com/messages');
      expect(url).toContain('receivedDateTime+ge+2026-09-01T00%3A00%3A00.000Z');
      expect((init!.headers as Record<string, string>)['Prefer']).toBe(
        'outlook.body-content-type="text"',
      );
      expect((init!.headers as Record<string, string>)['Authorization']).toBe('Bearer token_abc');
    });

    it('throws DeployMailGraphError on a non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));

      await expect(
        listRecentDeployMails('token_abc', 'deploys@example.com', '2026-09-01T00:00:00.000Z'),
      ).rejects.toThrow(DeployMailGraphError);
    });
  });
});
