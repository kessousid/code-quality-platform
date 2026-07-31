import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { UnitTestRunDetailPage } from './UnitTestRunDetailPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('UnitTestRunDetailPage', () => {
  it("shows a completed run's summary, generated files, and test results", async () => {
    server.unitTestRuns.push({
      id: 'run_1',
      orgId: 'org_1',
      repoId: 'repo_1',
      target: { path: 'src/math.ts' },
      status: 'completed',
      createdAt: new Date().toISOString(),
      testsTotal: 2,
      testsPassed: 1,
      testsFailed: 1,
    });
    server.generatedFilesByRun.set('run_1', [
      {
        id: 'gf_1',
        runId: 'run_1',
        sourceFilePath: 'src/math.ts',
        testFilePath: 'src/math.generated.test.ts',
      },
    ]);
    server.resultsByRun.set('run_1', [
      {
        id: 't1',
        runId: 'run_1',
        testFilePath: 'src/math.generated.test.ts',
        testName: 'adds numbers',
        status: 'passed',
      },
      {
        id: 't2',
        runId: 'run_1',
        testFilePath: 'src/math.generated.test.ts',
        testName: 'fails on purpose',
        status: 'failed',
        failureMessage: 'Expected 3 but got 2',
      },
    ]);

    renderWithProviders(<UnitTestRunDetailPage />, {
      route: '/unit-tests/run_1',
      path: '/unit-tests/:runId',
    });

    await waitFor(() => expect(screen.getByText('adds numbers')).toBeInTheDocument());
    expect(screen.getByText('fails on purpose')).toBeInTheDocument();
    expect(screen.getAllByText('src/math.generated.test.ts').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByText('fails on purpose'));
    expect(screen.getByText('Expected 3 but got 2')).toBeInTheDocument();
  });

  it('shows live progress and a cancel button for a running run, and cancels through the real endpoint', async () => {
    server.unitTestRuns.push({
      id: 'run_2',
      orgId: 'org_1',
      repoId: 'repo_1',
      target: { path: 'src' },
      status: 'running',
      createdAt: new Date().toISOString(),
      filesTotal: 4,
      filesCompleted: 1,
      currentFilePath: 'src/b.ts',
    });

    renderWithProviders(<UnitTestRunDetailPage />, {
      route: '/unit-tests/run_2',
      path: '/unit-tests/:runId',
    });

    await waitFor(() =>
      expect(screen.getByText(/Generating\/running 1\/4 files/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/current: src\/b\.ts/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.getByText('This run was cancelled.')).toBeInTheDocument());
    expect(server.unitTestRuns[0]!.status).toBe('cancelled');
  });

  it('generates a unit test report through the real endpoint and then offers a download', async () => {
    server.unitTestRuns.push({
      id: 'run_3',
      orgId: 'org_1',
      repoId: 'repo_1',
      target: { path: 'src/math.ts' },
      status: 'completed',
      createdAt: new Date().toISOString(),
      testsTotal: 1,
      testsPassed: 1,
      testsFailed: 0,
    });

    renderWithProviders(<UnitTestRunDetailPage />, {
      route: '/unit-tests/run_3',
      path: '/unit-tests/:runId',
    });
    await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());

    const user = userEvent.setup();
    const jsonRow = screen.getByText('json').closest('div')!;
    await user.click(within(jsonRow).getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(within(jsonRow).getByRole('button', { name: 'Download' })).toBeInTheDocument(),
    );
    expect((server.unitTestReportsByRun.get('run_3') ?? []).map((r) => r.format)).toContain('json');
    // The xlsx report auto-generates the moment this already-completed run's page loads (docs/adr/0034) — not just the json one clicked manually above.
    await waitFor(() =>
      expect((server.unitTestReportsByRun.get('run_3') ?? []).map((r) => r.format)).toContain(
        'xlsx',
      ),
    );
    expect(server.unitTestReportsByRun.get('run_3')).toHaveLength(2);
  });
});
