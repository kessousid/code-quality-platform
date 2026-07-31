import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { UnitTestReportActions } from './UnitTestReportActions.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

/** rerender() replaces the whole previously-rendered tree — this keeps the same QueryClientProvider wrapper across rerenders, unlike renderWithProviders' plain rerender which would drop it. */
function renderWithSameQueryClient(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  return {
    ...utils,
    rerenderSame: (next: React.ReactElement) =>
      utils.rerender(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>),
  };
}

describe('UnitTestReportActions', () => {
  it('does not auto-generate anything while the run is still in progress', async () => {
    renderWithProviders(<UnitTestReportActions runId="run_1" runStatus="running" />);

    await waitFor(() => expect(screen.getAllByText('Generate').length).toBeGreaterThan(0));
    expect(server.unitTestReportsByRun.get('run_1') ?? []).toHaveLength(0);
  });

  it('auto-generates the xlsx report exactly once, the moment the run is completed', async () => {
    const { rerenderSame } = renderWithSameQueryClient(
      <UnitTestReportActions runId="run_1" runStatus="running" />,
    );

    rerenderSame(<UnitTestReportActions runId="run_1" runStatus="completed" />);

    await waitFor(() => {
      const reports = server.unitTestReportsByRun.get('run_1') ?? [];
      expect(reports.map((r) => r.format)).toContain('xlsx');
    });
    expect(server.unitTestReportsByRun.get('run_1') ?? []).toHaveLength(1);

    // A later re-render with the same completed status (e.g. a subsequent poll tick) must not fire a second POST.
    rerenderSame(<UnitTestReportActions runId="run_1" runStatus="completed" />);
    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));
    expect(server.unitTestReportsByRun.get('run_1') ?? []).toHaveLength(1);
  });

  it('does not auto-generate again if an xlsx report already exists for the run', async () => {
    server.unitTestReportsByRun.set('run_1', [
      {
        id: 'existing-xlsx',
        orgId: 'org_1',
        unitTestRunId: 'run_1',
        format: 'xlsx',
        storageKey: 'k/run_1/xlsx',
        createdAt: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<UnitTestReportActions runId="run_1" runStatus="completed" />);

    await waitFor(() => screen.getByRole('button', { name: 'Regenerate' }));
    expect(server.unitTestReportsByRun.get('run_1')).toHaveLength(1);
  });
});
