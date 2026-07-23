import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { CoverageRunDetailPage } from './CoverageRunDetailPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;
});

afterEach(async () => {
  await server.close();
});

describe('CoverageRunDetailPage', () => {
  it('shows a failed gate verdict, summary tiles, and per-file uncovered lines for a completed run', async () => {
    server.coverageRuns.push({
      id: 'crun_1',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'completed',
      createdAt: new Date().toISOString(),
      gatePassed: false,
      testsTotal: 1,
      testsPassed: 1,
      testsFailed: 0,
      changedLinesTotal: 2,
      uncoveredLinesTotal: 1,
    });
    server.coverageFileResultsByRun.set('crun_1', [
      {
        id: 'cf1',
        runId: 'crun_1',
        filePath: 'src/math.ts',
        changedLines: [4, 5],
        uncoveredLines: [5],
        status: 'uncovered',
      },
    ]);

    renderWithProviders(<CoverageRunDetailPage />, {
      route: '/coverage-runs/crun_1',
      path: '/coverage-runs/:runId',
    });

    await waitFor(() => expect(screen.getByText(/Gate failed/)).toBeInTheDocument());
    expect(screen.getByText(/1 of 2 changed line\(s\) uncovered/)).toBeInTheDocument();
    expect(screen.getByText('src/math.ts')).toBeInTheDocument();
    expect(screen.getByText(/Uncovered lines: 5/)).toBeInTheDocument();
  });

  it('shows a passed gate verdict for a fully-covered completed run', async () => {
    server.coverageRuns.push({
      id: 'crun_2',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'completed',
      createdAt: new Date().toISOString(),
      gatePassed: true,
      testsTotal: 1,
      testsPassed: 1,
      testsFailed: 0,
      changedLinesTotal: 1,
      uncoveredLinesTotal: 0,
    });

    renderWithProviders(<CoverageRunDetailPage />, {
      route: '/coverage-runs/crun_2',
      path: '/coverage-runs/:runId',
    });

    await waitFor(() => expect(screen.getByText(/Gate passed/)).toBeInTheDocument());
  });

  it('shows a cancel button for a running run, and cancels through the real endpoint', async () => {
    server.coverageRuns.push({
      id: 'crun_3',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'running',
      createdAt: new Date().toISOString(),
    });

    renderWithProviders(<CoverageRunDetailPage />, {
      route: '/coverage-runs/crun_3',
      path: '/coverage-runs/:runId',
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.getByText('This run was cancelled.')).toBeInTheDocument());
    expect(server.coverageRuns[0]!.status).toBe('cancelled');
  });

  it('generates a coverage report through the real endpoint and then offers a download', async () => {
    server.coverageRuns.push({
      id: 'crun_4',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'completed',
      createdAt: new Date().toISOString(),
      gatePassed: true,
    });

    renderWithProviders(<CoverageRunDetailPage />, {
      route: '/coverage-runs/crun_4',
      path: '/coverage-runs/:runId',
    });
    await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());

    const user = userEvent.setup();
    const jsonRow = screen.getByText('json').closest('div')!;
    await user.click(within(jsonRow).getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(within(jsonRow).getByRole('button', { name: 'Download' })).toBeInTheDocument(),
    );
    expect(server.coverageReportsByRun.get('crun_4')).toHaveLength(1);
  });

  it('wires an uncovered file to the Gemini generator, then re-runs the gate and navigates to the fresh result', async () => {
    server.coverageRuns.push({
      id: 'crun_5',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'completed',
      createdAt: new Date().toISOString(),
      gatePassed: false,
      changedLinesTotal: 1,
      uncoveredLinesTotal: 1,
    });
    server.coverageFileResultsByRun.set('crun_5', [
      {
        id: 'cf1',
        runId: 'crun_5',
        filePath: 'math.js',
        changedLines: [6],
        uncoveredLines: [6],
        status: 'uncovered',
      },
    ]);

    renderWithProviders(
      <Routes>
        <Route path="/coverage-runs/:runId" element={<CoverageRunDetailPage />} />
      </Routes>,
      { route: '/coverage-runs/crun_5' },
    );

    await waitFor(() => expect(screen.getByText(/Gate failed/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Generate tests with Gemini' }));

    // Step 1: a real unit-test-run was created targeting exactly the uncovered file.
    await waitFor(() => expect(server.unitTestRuns).toHaveLength(1));
    expect(server.unitTestRuns[0]!.repoId).toBe('repo_1');
    expect(server.unitTestRuns[0]!.target).toEqual({ path: 'math.js' });

    // Simulate the worker finishing the generation run.
    server.unitTestRuns[0]!.status = 'completed';

    // Step 2: once that finished, the gate was automatically re-run against the same repo/baseRef.
    await waitFor(() => expect(server.coverageRuns).toHaveLength(2), { timeout: 6000 });
    expect(server.coverageRuns[1]!.repoId).toBe('repo_1');
    expect(server.coverageRuns[1]!.baseRef).toBe('main');

    // Step 3: navigated to the fresh run's own page (still queued, since this fake server has no worker).
    await waitFor(() => expect(screen.getByText(/Queued — waiting/)).toBeInTheDocument());
  });
});
