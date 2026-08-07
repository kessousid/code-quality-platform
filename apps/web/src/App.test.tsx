import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { startLocalApiServer, type LocalApiServer } from './test/local-api-server.js';

let server: LocalApiServer;

beforeEach(async () => {
  // BrowserRouter reads the real jsdom `window.location`, which persists
  // across tests in this file — without resetting it, a previous test's
  // navigation (e.g. to /crons) leaks into the next test's initial route.
  window.history.pushState({}, '', '/');
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

    expect(screen.getByText('Code Quality & Security')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No repos yet/)).toBeInTheDocument());
  });

  it("shows the selected feature's own name as the dashboard heading, not the generic platform title", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Feature' }), 'unit-testing');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Unit Testing')).toBeInTheDocument();
    expect(
      screen.queryByText('Code Quality & Security Assessment Platform'),
    ).not.toBeInTheDocument();
  });

  it('hides Cron Runner from the feature picker for the time being', async () => {
    render(<App />);

    expect(screen.queryByRole('option', { name: 'Cron Runner' })).not.toBeInTheDocument();
  });

  it('still serves /crons directly even though it is hidden from the picker', async () => {
    window.history.pushState({}, '', '/crons');
    render(<App />);

    await waitFor(() => expect(screen.getAllByText('Cron Runner').length).toBeGreaterThan(0));
  });

  it('takes the QA Automation feature straight to /qa-automation, skipping the dashboard', async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Feature' }), 'qa-automation');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('QA Automation')).toBeInTheDocument());
    expect(screen.queryByText('No repos yet')).not.toBeInTheDocument();
  });
});
