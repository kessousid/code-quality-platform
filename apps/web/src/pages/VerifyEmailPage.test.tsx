import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { VerifyEmailPage } from './VerifyEmailPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

function renderVerifyEmailPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/" element={<div>dashboard-landed</div>} />
    </Routes>,
    { route },
  );
}

describe('VerifyEmailPage', () => {
  it('auto-submits the token from the URL, activates the account, and navigates home', async () => {
    server.mockUsers.set('new@curatal.com', { password: 'x', status: 'pending_verification' });
    server.authTokens.verification = 'verify-new@curatal.com';

    renderVerifyEmailPage('/verify-email?token=verify-new@curatal.com');

    await waitFor(() => expect(screen.getByText('dashboard-landed')).toBeInTheDocument());
    expect(server.mockUsers.get('new@curatal.com')?.status).toBe('active');
  });

  it('shows an error for an invalid or expired token', async () => {
    renderVerifyEmailPage('/verify-email?token=not-a-real-token');

    await waitFor(() => expect(screen.getByText('Verification failed')).toBeInTheDocument());
    expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument();
  });

  it('shows an error when the URL has no token at all', () => {
    renderVerifyEmailPage('/verify-email');
    expect(screen.getByText('Invalid link')).toBeInTheDocument();
  });
});
