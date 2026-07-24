import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { DashboardPage } from './DashboardPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('DashboardPage', () => {
  it('lists repos fetched from a real API and creates a new one through the real POST endpoint', async () => {
    server.repos.push({
      id: 'repo_existing',
      orgId: 'org_1',
      name: 'existing-repo',
      provider: 'local',
      workerId: 'default',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('existing-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('New repo name'), 'brand-new-repo');
    await user.type(
      screen.getByPlaceholderText(/Local checkout path/),
      'C:\\repos\\brand-new-repo',
    );
    await user.click(screen.getByRole('button', { name: 'Add repo' }));

    await waitFor(() => expect(screen.getByText('brand-new-repo')).toBeInTheDocument());
    const created = server.repos.find((r) => r.name === 'brand-new-repo');
    expect(created?.localPath).toBe('C:\\repos\\brand-new-repo');
    // Real gap this phase closes (docs/adr/0021): without a local
    // checkout, a repo is created but can never actually be scanned.
    expect(screen.getByText(/C:\\repos\\brand-new-repo/)).toBeInTheDocument();
  });

  it('picks a local checkout path through the real GET /fs/browse endpoint', async () => {
    server.directories.set('C:\\projects', {
      path: 'C:\\projects',
      parent: 'C:\\',
      entries: [{ name: 'my-app', path: 'C:\\projects\\my-app', type: 'directory' }],
    });

    renderWithProviders(<DashboardPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Local checkout path/), 'C:\\projects');
    await user.click(screen.getByRole('button', { name: 'Browse…' }));

    await waitFor(() => expect(screen.getByText(/my-app/)).toBeInTheDocument());
    await user.click(screen.getByText(/my-app/));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use this folder' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Local checkout path/)).toHaveValue(
        'C:\\projects\\my-app',
      ),
    );
  });
});
