import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('ForgotPasswordPage', () => {
  it('shows the same success message for a real account as for an unknown one (anti-enumeration)', async () => {
    server.mockUsers.set('real@curatal.com', { password: 'x', status: 'active' });
    renderWithProviders(<ForgotPasswordPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'real@curatal.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
    expect(server.authTokens.reset).toBeDefined();
  });

  it('still succeeds (silently, no email) for an unknown email', async () => {
    renderWithProviders(<ForgotPasswordPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'nobody@curatal.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
    expect(server.authTokens.reset).toBeUndefined();
  });

  it('rejects a non-curatal.com email with an error, not the success message', async () => {
    renderWithProviders(<ForgotPasswordPage />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'someone@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() =>
      expect(
        screen.getByText('Only @curatal.com email addresses are allowed.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });
});
