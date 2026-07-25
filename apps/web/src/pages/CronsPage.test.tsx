import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { CronsPage } from './CronsPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('CronsPage', () => {
  it('triggers a cron through the real POST endpoint and shows the result, then lists it in history', async () => {
    renderWithProviders(<CronsPage />);

    await waitFor(() => expect(screen.getByText('get cod candidates')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Cron' }),
      'cod-candidate-search',
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getAllByText('succeeded')).toHaveLength(2)); // result panel + history
    expect(screen.getAllByText(/HTTP 200/)).toHaveLength(2);
    expect(server.cronRuns).toHaveLength(1);
    expect(server.cronRuns[0]?.cronId).toBe('cod-candidate-search');
    // one in the select option, one in the history entry
    expect(screen.getAllByText('get cod candidates')).toHaveLength(2);
  });

  it('404s clearly when triggering an unknown cron', async () => {
    server.cronRuns.length = 0;
    renderWithProviders(<CronsPage />);
    await waitFor(() => expect(screen.getByText('get cod candidates')).toBeInTheDocument());

    // No real UI path to select an unknown cronId, so this exercises the
    // server contract directly — the use-case-level 404 mapping is already
    // covered by cron-run.controller.spec.ts in apps/api.
    const response = await fetch(`${server.baseUrl}/cron-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronId: 'does-not-exist', environment: 'dev' }),
    });
    expect(response.status).toBe(404);
  });
});
