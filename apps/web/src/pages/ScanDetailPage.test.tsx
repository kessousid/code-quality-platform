import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render-with-providers.js';
import { startLocalApiServer, type LocalApiServer } from '../test/local-api-server.js';
import { ScanDetailPage } from './ScanDetailPage.js';

let server: LocalApiServer;

beforeEach(async () => {
  server = await startLocalApiServer();
  import.meta.env.VITE_API_BASE_URL = server.baseUrl;

  server.scans.push({
    id: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    ref: 'main',
    mode: 'full',
    status: 'completed',
    createdAt: new Date().toISOString(),
  });
  server.summaryByScan.set('scan_1', {
    totalFindings: 2,
    openFindings: 1,
    bySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    byCategory: { security: 1, 'technical-debt': 1 },
    healthScore: 75,
  });
  server.findingsByScan.set('scan_1', [
    {
      id: 'f1',
      scanId: 'scan_1',
      orgId: 'org_1',
      repoId: 'repo_1',
      category: 'security',
      source: 'semgrep',
      ruleId: 'eval-detected',
      title: 'Use of eval() with untrusted input',
      severity: 'critical',
      confidence: 'high',
      locations: [{ filePath: 'src/vuln.js', startLine: 6 }],
      rootCause: 'x',
      riskDescription: 'y',
      recommendedFix: 'Remove eval().',
      references: [],
      patchPrConfirmedByUser: false,
      firstSeenScanId: 'scan_1',
      lastSeenScanId: 'scan_1',
      status: 'open',
    },
  ]);
});

afterEach(async () => {
  await server.close();
});

describe('ScanDetailPage', () => {
  it('renders real score tiles and the real findings list fetched from the API', async () => {
    renderWithProviders(<ScanDetailPage />, { route: '/scans/scan_1', path: '/scans/:scanId' });

    await waitFor(() => expect(screen.getByText('75')).toBeInTheDocument()); // Overall Health tile
    expect(screen.getByText('Use of eval() with untrusted input')).toBeInTheDocument();
    expect(screen.getByText('Remove eval().')).toBeInTheDocument();
    expect(
      screen.getByText('Automated analysis not available for this finding.'),
    ).toBeInTheDocument();
  });

  it('renders the automated-analysis panel when the API attaches one', async () => {
    server.findingsByScan.get('scan_1')!.push({
      id: 'f2',
      scanId: 'scan_1',
      orgId: 'org_1',
      repoId: 'repo_1',
      category: 'secret-detection',
      source: 'gitleaks',
      ruleId: 'slack-bot-token',
      title: 'Hardcoded Slack token',
      severity: 'critical',
      confidence: 'high',
      locations: [{ filePath: 'src/config.js', startLine: 3 }],
      rootCause: 'x',
      riskDescription: 'y',
      recommendedFix: 'Rotate and remove the token.',
      references: [],
      patchPrConfirmedByUser: false,
      firstSeenScanId: 'scan_1',
      lastSeenScanId: 'scan_1',
      status: 'open',
      ai: {
        plainEnglishExplanation: 'AUTOMATED_EXPLANATION_MARKER',
        businessImpact: 'AUTOMATED_IMPACT_MARKER',
        relatedFindingIds: [],
      },
    });

    renderWithProviders(<ScanDetailPage />, { route: '/scans/scan_1', path: '/scans/:scanId' });

    await waitFor(() =>
      expect(screen.getByText('AUTOMATED_EXPLANATION_MARKER')).toBeInTheDocument(),
    );
    expect(screen.getByText('AUTOMATED_IMPACT_MARKER')).toBeInTheDocument();
    expect(screen.getAllByText('Automated analysis').length).toBeGreaterThan(0);
  });

  it('generates a report through the real endpoint and then offers a download', async () => {
    renderWithProviders(<ScanDetailPage />, { route: '/scans/scan_1', path: '/scans/:scanId' });
    await waitFor(() => expect(screen.getByText('75')).toBeInTheDocument());

    const user = userEvent.setup();
    const jsonRow = screen.getByText('json').closest('div')!;
    await user.click(within(jsonRow).getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(within(jsonRow).getByRole('button', { name: 'Download' })).toBeInTheDocument(),
    );
    expect(server.reportsByScan.get('scan_1')).toHaveLength(1);
  });

  it('filters findings by severity', async () => {
    renderWithProviders(<ScanDetailPage />, { route: '/scans/scan_1', path: '/scans/:scanId' });
    await waitFor(() =>
      expect(screen.getByText('Use of eval() with untrusted input')).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    const severitySelect = screen.getAllByRole('combobox')[0]!;
    await user.selectOptions(severitySelect, 'low');

    expect(screen.getByText('No findings match this filter.')).toBeInTheDocument();
  });

  it('shows live progress and a cancel button for a running scan, and cancels through the real endpoint', async () => {
    server.scans[0]!.status = 'running';
    server.scans[0]!.pluginsTotal = 6;
    server.scans[0]!.pluginsCompleted = 2;
    server.scans[0]!.currentPluginId = 'eslint';

    renderWithProviders(<ScanDetailPage />, { route: '/scans/scan_1', path: '/scans/:scanId' });

    await waitFor(() => expect(screen.getByText(/Running 2\/6 analyzers/)).toBeInTheDocument());
    expect(screen.getByText(/last started: eslint/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel scan' }));

    await waitFor(() => expect(screen.getByText('This scan was cancelled.')).toBeInTheDocument());
    expect(server.scans[0]!.status).toBe('cancelled');
  });
});
