import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { DirectoryBrowser } from './DirectoryBrowser.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('DirectoryBrowser', () => {
  it("surfaces a worker-unreachable error quickly, without React Query's default retries multiplying the wait", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <DirectoryBrowser workerId="unreachable-worker" onSelect={onSelect} onClose={onClose} />,
    );

    // Real docs/adr/0032 error text — asserted well under the ~50s+ that
    // React Query's default 3 retries would have added on top of the
    // ~11s the real BullMQ timeout itself takes, before this fix.
    await waitFor(
      () => expect(screen.getByText(/No worker responded within 10000ms/)).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // The header no longer falsely claims "Loading…" once the request has actually failed.
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('(could not load)')).toBeInTheDocument();
  });

  it('lists real directory entries fetched from the real GET /fs/browse endpoint', async () => {
    server.directories.set('C:\\projects', {
      path: 'C:\\projects',
      parent: 'C:\\',
      entries: [{ name: 'my-app', path: 'C:\\projects\\my-app', type: 'directory' }],
    });

    renderWithProviders(
      <DirectoryBrowser initialPath="C:\projects" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText(/my-app/)).toBeInTheDocument());
    expect(screen.queryByText('(could not load)')).not.toBeInTheDocument();
  });
});
