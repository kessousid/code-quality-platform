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

async function switchToStagingTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Staging' }));
}

describe('QaAutomationPage', () => {
  it('shows the Production tab by default, with the two Production/Staging switch buttons', async () => {
    renderWithProviders(<QaAutomationPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Production' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Staging' })).toBeInTheDocument();
  });

  it('disabling the production schedule calls the real endpoint with enabled: false', async () => {
    renderWithProviders(<QaAutomationPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(server.qaAutomationSchedule.enabled).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument());
  });

  it('triggers a production run and shows it in history, expanding to see per-test results', async () => {
    renderWithProviders(<QaAutomationPage />);
    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(screen.getByText('Successfully Executed')).toBeInTheDocument());
    expect(server.qaAutomationRuns).toHaveLength(1);
    expect(server.qaAutomationRuns[0]?.environment).toBe('production');

    await user.click(screen.getByText('Successfully Executed'));
    await waitFor(() =>
      expect(
        screen.getByText('Slot listing pricing matches Sunday/weekday business rule'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('1 passed, 0 failed, 0 skipped (of 1)')).toBeInTheDocument();
  });

  it('breaks a skipped test out into its own Skipped count and label, instead of counting it as a failure', async () => {
    renderWithProviders(<QaAutomationPage />);
    const user = userEvent.setup();
    await switchToStagingTab(user);

    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(screen.getByText('Successfully Executed')).toBeInTheDocument());

    const runId = server.qaAutomationRuns[0]!.id;
    server.qaAutomationResultsByRun.set(runId, [
      {
        id: 'r1',
        runId,
        testId: 'test-pass',
        testName: 'A passing test',
        passed: true,
        details: 'ok',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'r2',
        runId,
        testId: 'test-fail',
        testName: 'A genuinely failing test',
        passed: false,
        details: 'AssertionError: nope',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'r3',
        runId,
        testId: 'test-skip',
        testName: 'A skipped test',
        passed: false,
        details: 'SKIPPED: 404 in this environment',
        createdAt: new Date().toISOString(),
      },
    ]);

    await user.click(screen.getByText('Successfully Executed'));
    await waitFor(() =>
      expect(screen.getByText('1 passed, 1 failed, 1 skipped (of 3)')).toBeInTheDocument(),
    );
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('SKIP')).toBeInTheDocument();
  });

  it('generates a PDF report for a production run through the real endpoint and can download it', async () => {
    renderWithProviders(<QaAutomationPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(screen.getByText('Successfully Executed')).toBeInTheDocument());
    await user.click(screen.getByText('Successfully Executed'));

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

  it('switches to the Staging tab, showing its own schedule and toggling it through the real PUT endpoint', async () => {
    renderWithProviders(<QaAutomationPage />);
    const user = userEvent.setup();
    await switchToStagingTab(user);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(server.qaAutomationStagingSchedule.enabled).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument());
  });

  it('triggers a staging run through the real endpoint and shows it in staging history only, separate from production', async () => {
    renderWithProviders(<QaAutomationPage />);
    const user = userEvent.setup();
    await switchToStagingTab(user);

    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(screen.getByText('Successfully Executed')).toBeInTheDocument());
    expect(server.qaAutomationRuns).toHaveLength(1);
    expect(server.qaAutomationRuns[0]?.environment).toBe('staging');

    await user.click(screen.getByRole('button', { name: 'Production' }));
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
  });

  it('shows a clickable source link for a staging result, so it is clear which repo/branch it ran from', async () => {
    renderWithProviders(<QaAutomationPage />);
    const user = userEvent.setup();
    await switchToStagingTab(user);

    await waitFor(() => expect(screen.getByText('No runs yet.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(screen.getByText('Successfully Executed')).toBeInTheDocument());
    await user.click(screen.getByText('Successfully Executed'));

    const link = await screen.findByRole('link', {
      name: /https:\/\/github\.com\/codewithVsingh\/curatal_tests\/tree\/main\/tests/,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/codewithVsingh/curatal_tests/tree/main/tests',
    );
  });

  it('shows a live progress bar for a staging run that is still running (docs/adr/0044)', async () => {
    server.qaAutomationRuns.unshift({
      id: 'qarun_in_progress',
      orgId: 'org_1',
      environment: 'staging',
      status: 'running',
      triggeredBy: 'scheduled',
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      progressPercent: 42,
    });
    renderWithProviders(<QaAutomationPage />);
    const user = userEvent.setup();
    await switchToStagingTab(user);

    await waitFor(() => expect(screen.getByText('42%')).toBeInTheDocument());
    expect(screen.getByLabelText('42% complete')).toBeInTheDocument();
  });
});
