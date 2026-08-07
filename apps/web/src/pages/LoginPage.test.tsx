import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { LoginPage } from './LoginPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

function renderLoginPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>dashboard-landed</div>} />
    </Routes>,
    { route: '/login' },
  );
}

describe('LoginPage', () => {
  it('logs in a verified curatal.com account via the real /auth/login endpoint, then navigates home', async () => {
    server.mockUsers.set('keshavkumar@curatal.com', {
      password: 'the-real-password',
      status: 'active',
    });
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'keshavkumar@curatal.com');
    await user.type(screen.getByPlaceholderText('Password'), 'the-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('dashboard-landed')).toBeInTheDocument());
  });

  it('shows an error and does not navigate for a non-curatal.com email', async () => {
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'someone@gmail.com');
    await user.type(screen.getByPlaceholderText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('Only @curatal.com email addresses may sign in')).toBeInTheDocument(),
    );
    expect(screen.queryByText('dashboard-landed')).not.toBeInTheDocument();
  });

  it('shows the real server message for the wrong password, and does not navigate', async () => {
    server.mockUsers.set('real@curatal.com', { password: 'the-real-password', status: 'active' });
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('you@curatal.com'), 'real@curatal.com');
    await user.type(screen.getByPlaceholderText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByText('Invalid email or password.')).toBeInTheDocument());
    expect(screen.queryByText('dashboard-landed')).not.toBeInTheDocument();
  });

  it('links to Sign up and Forgot Password', () => {
    renderLoginPage();
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Forgot Password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
