import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { QaAutomationPage } from './QaAutomationPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('QaAutomationPage', () => {
  it('shows the current schedule and saves a new interval through the real PUT endpoint', async () => {
    renderWithProviders(<QaAutomationPage />);

    await waitFor(() => expect(screen.getByLabelText('Interval hours')).toHaveValue(12));

    const user = userEvent.setup();
    const input = screen.getByLabelText('Interval hours');
    await user.clear(input);
    await user.type(input, '6');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(server.qaAutomationSchedule.intervalHours).toBe(6));
  });

  it('disabling the schedule calls the real endpoint with enabled: false', async () => {
    renderWithProviders(<QaAutomationPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(server.qaAutomationSchedule.enabled).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument());
  });

  it('triggers a run and shows it in history, expanding to see per-test results', async () => {
    renderWithProviders(<QaAutomationPage />);
    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(screen.getByText('completed')).toBeInTheDocument());
    expect(server.qaAutomationRuns).toHaveLength(1);

    await user.click(screen.getByText('completed'));
    await waitFor(() =>
      expect(
        screen.getByText('Slot listing pricing matches Sunday/weekday business rule'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('generates a PDF report for a run through the real endpoint and can download it', async () => {
    renderWithProviders(<QaAutomationPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(screen.getByText('completed')).toBeInTheDocument());
    await user.click(screen.getByText('completed'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate PDF report' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Generate PDF report' }));

    await waitFor(() => expect(server.qaAutomationReportsByRun.size).toBe(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Regenerate PDF report' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});
