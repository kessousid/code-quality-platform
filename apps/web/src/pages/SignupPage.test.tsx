import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { SignupPage } from './SignupPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

function renderSignupPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
    </Routes>,
    { route: '/signup' },
  );
}

describe('SignupPage', () => {
  it('creates a pending account via the real /auth/signup endpoint and shows a check-your-email message, without logging in', async () => {
    renderSignupPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'newperson@curatal.com');
    await user.type(
      screen.getByPlaceholderText('Password (at least 8 characters)'),
      'a-real-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeInTheDocument());
    expect(screen.getByText('newperson@curatal.com')).toBeInTheDocument();

    const created = server.mockUsers.get('newperson@curatal.com');
    expect(created?.status).toBe('pending_verification');
    expect(server.authTokens.verification).toBeDefined();
  });

  it('shows the real server error for an already-registered email', async () => {
    server.mockUsers.set('taken@curatal.com', { password: 'x', status: 'active' });
    renderSignupPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'taken@curatal.com');
    await user.type(
      screen.getByPlaceholderText('Password (at least 8 characters)'),
      'a-real-password',
    );
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() =>
      expect(screen.getByText('taken@curatal.com is already registered.')).toBeInTheDocument(),
    );
  });
});
