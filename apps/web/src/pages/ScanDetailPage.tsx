import { Link, useParams } from 'react-router-dom';
import { useScan, useScanFindings, useScanSummary } from '../api/hooks.js';
import { ScoreTile } from '../components/ScoreTile.js';
import { FindingsTable } from '../components/FindingsTable.js';
import { ReportActions } from '../components/ReportActions.js';
import { DependencyGraphPreview } from '../components/DependencyGraphPreview.js';
import { ScanStatusHeader } from '../components/ScanStatusHeader.js';

function scoreTone(score: number): 'good' | 'warning' | 'critical' {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

export function ScanDetailPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const scanQuery = useScan(scanId);
  const summaryQuery = useScanSummary(scanId);
  const findingsQuery = useScanFindings(scanId);

  const summary = summaryQuery.data;
  const scan = scanQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {scan && (
        <Link to={`/repos/${scan.repoId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to repo
        </Link>
      )}
      {scanId && <ScanStatusHeader scanId={scanId} scan={scan} />}

      {summaryQuery.isLoading && <p className="text-sm text-neutral-500">Loading summary…</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ScoreTile
            label="Overall Health"
            value={summary.healthScore}
            tone={scoreTone(summary.healthScore)}
          />
          <ScoreTile
            label="Open Findings"
            value={summary.openFindings}
            tone={summary.openFindings === 0 ? 'good' : 'warning'}
          />
          <ScoreTile
            label="Critical + High"
            value={summary.bySeverity.critical + summary.bySeverity.high}
            tone={summary.bySeverity.critical + summary.bySeverity.high === 0 ? 'good' : 'critical'}
          />
          <ScoreTile
            label="Technical Debt Items"
            value={summary.byCategory['technical-debt'] ?? 0}
            tone="warning"
          />
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Reports</h2>
        {scanId && <ReportActions scanId={scanId} />}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">
          Findings {findingsQuery.data ? `(${findingsQuery.data.length})` : ''}
        </h2>
        {findingsQuery.isLoading && <p className="text-sm text-neutral-500">Loading findings…</p>}
        {findingsQuery.data && <FindingsTable findings={findingsQuery.data} />}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Dependency graph</h2>
        <p className="mb-2 text-xs italic text-neutral-400">
          Preview only — the real dependency graph is produced by the scan engine but not yet
          exposed via the API (Scan.dependencyGraphStorageKey is unpopulated until the worker
          pipeline is wired up).
        </p>
        <DependencyGraphPreview />
      </section>
    </div>
  );
}
