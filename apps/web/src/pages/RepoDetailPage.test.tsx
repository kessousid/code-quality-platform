import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { RepoDetailPage } from './RepoDetailPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;

  server.repos.push({
    id: 'repo_1',
    orgId: 'org_1',
    name: 'demo-repo',
    provider: 'local',
    workerId: 'default',
    defaultBranch: 'main',
    createdAt: new Date().toISOString(),
  });
});

afterEach(async () => {
  await server.close();
});

describe('RepoDetailPage', () => {
  it('shows the repo name and starts a scan through the real POST /scans endpoint', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });

    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());
    expect(screen.getByText('No scans yet.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Start scan' }));

    await waitFor(() => expect(screen.getByText('main · full')).toBeInTheDocument());
    expect(server.scans).toHaveLength(1);
    expect(server.scans[0]!.repoId).toBe('repo_1');
  });

  it('sends selected categories through the real POST /scans endpoint', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Security' }));
    await user.click(screen.getByRole('checkbox', { name: 'Secret detection' }));
    await user.click(screen.getByRole('button', { name: 'Start scan' }));

    await waitFor(() => expect(server.scans).toHaveLength(1));
    expect(server.scans[0]!.categories).toEqual(['security', 'secret-detection']);
  });

  it('creates a unit test run through the real POST /unit-tests endpoint, behind its own tab', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    // The unit-testing module lives behind its own tab, separate from code quality & security.
    expect(screen.queryByText('No unit test runs yet.')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));
    // Gemini-based generation is now secondary/collapsed behind the primary coverage-gate flow (docs/adr/0025).
    await user.click(screen.getByText('Generate unit tests with Gemini (secondary)'));
    await waitFor(() => expect(screen.getByText('No unit test runs yet.')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Target file or folder/), 'src/math.ts');
    await user.type(screen.getByPlaceholderText(/Specific function name/), 'add');
    await user.click(screen.getByRole('button', { name: 'Generate & run' }));

    await waitFor(() => expect(screen.getByText('src/math.ts :: add')).toBeInTheDocument());
    expect(server.unitTestRuns).toHaveLength(1);
    expect(server.unitTestRuns[0]!.target).toEqual({ path: 'src/math.ts', functionName: 'add' });
    expect(server.unitTestRuns[0]!.generator).toBe('gemini'); // the radio selector defaults to Gemini
  });

  it('sends the script-based generator choice through the real POST /unit-tests endpoint when selected', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));
    await user.click(screen.getByText('Generate unit tests with Gemini (secondary)'));
    await waitFor(() => expect(screen.getByText('No unit test runs yet.')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Target file or folder/), 'src/math.ts');
    await user.click(screen.getByRole('radio', { name: /Script-based/ }));
    await user.click(screen.getByRole('button', { name: 'Generate & run' }));

    await waitFor(() => expect(server.unitTestRuns).toHaveLength(1));
    expect(server.unitTestRuns[0]!.generator).toBe('script');
  });

  it('picking the repo root itself via the folder browser still submits a real target, not a silently-empty one', async () => {
    server.repos.push({
      id: 'repo_2',
      orgId: 'org_1',
      name: 'nested-repo',
      provider: 'local',
      workerId: 'default',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
      localPath: 'C:\\CuratalIT\\assessment\\src\\controllers',
    });
    server.directories.set('C:\\CuratalIT\\assessment\\src\\controllers', {
      path: 'C:\\CuratalIT\\assessment\\src\\controllers',
      parent: 'C:\\CuratalIT\\assessment\\src',
      entries: [
        {
          name: 'assessment.controller.js',
          path: 'C:\\CuratalIT\\assessment\\src\\controllers\\assessment.controller.js',
          type: 'file',
        },
      ],
    });

    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_2', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('nested-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));
    await user.click(screen.getByText('Generate unit tests with Gemini (secondary)'));
    await waitFor(() => expect(screen.getByText('No unit test runs yet.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Browse…' }));
    // Selecting the repo root itself — the exact folder the browser opened on — without navigating anywhere else first.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use this folder' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));

    // The field shows the real, recognizable absolute path — not a blank-looking '.' — even though the picked
    // folder is the repo root itself; the conversion down to a repo-relative path happens only at submit time.
    expect(screen.getByPlaceholderText(/Target file or folder/)).toHaveValue(
      'C:\\CuratalIT\\assessment\\src\\controllers',
    );
    await user.click(screen.getByRole('button', { name: 'Generate & run' }));

    await waitFor(() => expect(server.unitTestRuns).toHaveLength(1));
    expect(server.unitTestRuns[0]!.target).toEqual({ path: '.' });
    // The stored value is still the real '.', but the run-history list renders a readable label, not a bare dot.
    await waitFor(() => expect(screen.getByText('whole repo')).toBeInTheDocument());
    expect(screen.queryByText('.')).not.toBeInTheDocument();
  });

  it('picking a subfolder shows its real absolute path and submits it relative to the repo root', async () => {
    server.repos.push({
      id: 'repo_3',
      orgId: 'org_1',
      name: 'nested-repo-2',
      provider: 'local',
      workerId: 'default',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
      localPath: 'C:\\CuratalIT\\assessment\\src\\controllers',
    });
    server.directories.set('C:\\CuratalIT\\assessment\\src\\controllers', {
      path: 'C:\\CuratalIT\\assessment\\src\\controllers',
      parent: 'C:\\CuratalIT\\assessment\\src',
      entries: [
        {
          name: 'helpers',
          path: 'C:\\CuratalIT\\assessment\\src\\controllers\\helpers',
          type: 'directory',
        },
      ],
    });
    server.directories.set('C:\\CuratalIT\\assessment\\src\\controllers\\helpers', {
      path: 'C:\\CuratalIT\\assessment\\src\\controllers\\helpers',
      parent: 'C:\\CuratalIT\\assessment\\src\\controllers',
      entries: [],
    });

    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_3', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('nested-repo-2')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));
    await user.click(screen.getByText('Generate unit tests with Gemini (secondary)'));
    await waitFor(() => expect(screen.getByText('No unit test runs yet.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Browse…' }));
    await user.click(await screen.findByText(/helpers/));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use this folder' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));

    expect(screen.getByPlaceholderText(/Target file or folder/)).toHaveValue(
      'C:\\CuratalIT\\assessment\\src\\controllers\\helpers',
    );
    await user.click(screen.getByRole('button', { name: 'Generate & run' }));

    await waitFor(() => expect(server.unitTestRuns).toHaveLength(1));
    expect(server.unitTestRuns[0]!.target).toEqual({ path: 'helpers' });
  });

  it('creates a coverage gate run through the real POST /coverage-runs endpoint, as the primary unit-testing flow', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));

    // The coverage gate is visible immediately, not behind the collapsed Gemini section.
    await waitFor(() => expect(screen.getByText('No coverage gate runs yet.')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Run coverage gate' }));

    await waitFor(() => expect(server.coverageRuns).toHaveLength(1));
    expect(server.coverageRuns[0]!.repoId).toBe('repo_1');
    expect(server.coverageRuns[0]!.baseRef).toBe('main');
  });

  it('shows the latest failed run inline and fixes it without leaving the page', async () => {
    server.coverageRuns.push({
      id: 'crun_1',
      orgId: 'org_1',
      repoId: 'repo_1',
      baseRef: 'main',
      status: 'completed',
      createdAt: new Date().toISOString(),
      gatePassed: false,
      changedLinesTotal: 1,
      uncoveredLinesTotal: 1,
    });
    server.coverageFileResultsByRun.set('crun_1', [
      {
        id: 'cf1',
        runId: 'crun_1',
        filePath: 'math.js',
        changedLines: [6],
        uncoveredLines: [6],
        status: 'uncovered',
      },
    ]);

    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));

    // The failed run's own verdict and uncovered file are visible right here — no click into another page needed.
    await waitFor(() => expect(screen.getByText(/Gate failed/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Generate tests with Gemini' }));

    await waitFor(() => expect(server.unitTestRuns).toHaveLength(1));
    expect(server.unitTestRuns[0]!.target).toEqual({ path: 'math.js' });
    server.unitTestRuns[0]!.status = 'completed';

    // The re-run happened, and this SAME page swapped to show the fresh result — still on /repos/repo_1, no navigation.
    await waitFor(() => expect(server.coverageRuns).toHaveLength(2), { timeout: 6000 });
    await waitFor(() => expect(screen.getByText(/Queued — waiting/)).toBeInTheDocument());
    expect(screen.queryByText(/Gate failed/)).not.toBeInTheDocument();
  });

  it('keeps the two modules separate — switching tabs hides the other module entirely', async () => {
    renderWithProviders(<RepoDetailPage />, { route: '/repos/repo_1', path: '/repos/:repoId' });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    // Code Quality & Security is the default tab.
    expect(screen.getByText('No scans yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Generate unit tests/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Unit Testing' }));

    expect(screen.queryByText('No scans yet.')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Generate unit tests/).length).toBeGreaterThan(0);
  });

  it('shows only the Code Quality & Security section, with no tab switcher, when that feature was chosen upfront', async () => {
    renderWithProviders(<RepoDetailPage feature="code-quality-security" />, {
      route: '/repos/repo_1',
      path: '/repos/:repoId',
    });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    expect(screen.getByText('No scans yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unit Testing' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Generate unit tests/)).not.toBeInTheDocument();
  });

  it('shows only the Unit Testing section, with no tab switcher, when that feature was chosen upfront', async () => {
    renderWithProviders(<RepoDetailPage feature="unit-testing" />, {
      route: '/repos/repo_1',
      path: '/repos/:repoId',
    });
    await waitFor(() => expect(screen.getByText('demo-repo')).toBeInTheDocument());

    expect(screen.queryByText('No scans yet.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Code Quality & Security' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/Generate unit tests/).length).toBeGreaterThan(0);
  });
});
