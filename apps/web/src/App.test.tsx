import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { startLocalApiServer, type LocalApiServer } from './test/local-api-server.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('App', () => {
  it('asks which feature to use before showing anything else, then loads the (empty) repo list from a real API', async () => {
    render(<App />);

    expect(screen.getByText('Which feature would you like to use?')).toBeInTheDocument();
    expect(screen.queryByText(/No repos yet/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Feature' }),
      'code-quality-security',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Code Quality & Security Assessment Platform')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No repos yet/)).toBeInTheDocument());
  });

  it('takes the Cron Runner feature straight to /crons, skipping the dashboard', async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Feature' }), 'cron-runner');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('Cron Runner')).toBeInTheDocument());
    expect(screen.queryByText('No repos yet')).not.toBeInTheDocument();
  });
});
