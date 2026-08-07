import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { ResetPasswordPage } from './ResetPasswordPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

function renderResetPasswordPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<div>dashboard-landed</div>} />
    </Routes>,
    { route },
  );
}

describe('ResetPasswordPage', () => {
  it('sets a new password via the real /auth/reset-password endpoint and navigates home (auto-login)', async () => {
    server.mockUsers.set('real@curatal.com', { password: 'old-password', status: 'active' });
    server.authTokens.reset = 'reset-real@curatal.com';
    renderResetPasswordPage('/reset-password?token=reset-real@curatal.com');

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('New password (at least 8 characters)'),
      'brand-new-password',
    );
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(screen.getByText('dashboard-landed')).toBeInTheDocument());
    expect(server.mockUsers.get('real@curatal.com')?.password).toBe('brand-new-password');
  });

  it('shows an error for an invalid or expired token', async () => {
    renderResetPasswordPage('/reset-password?token=not-a-real-token');

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('New password (at least 8 characters)'),
      'brand-new-password',
    );
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() =>
      expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('dashboard-landed')).not.toBeInTheDocument();
  });

  it('shows an invalid-link state when the URL has no token at all', () => {
    renderResetPasswordPage('/reset-password');
    expect(screen.getByText('Invalid link')).toBeInTheDocument();
  });
});
