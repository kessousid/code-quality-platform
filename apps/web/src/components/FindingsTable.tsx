import { useMemo, useState } from 'react';
import type { AnalysisCategory, Finding } from '@cqp/core';
import { SeverityBadge } from './SeverityBadge.js';

const SEVERITIES: Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES: Finding['status'][] = ['open', 'fixed', 'ignored', 'false-positive'];

function categories(findings: Finding[]): AnalysisCategory[] {
  return [...new Set(findings.map((f) => f.category))].sort();
}

/** Client-side filtering — a single scan's finding set is bounded, so no server round trip per filter change. */
export function FindingsTable({ findings }: { findings: Finding[] }) {
  const [severity, setSeverity] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');

  const filtered = useMemo(
    () =>
      findings.filter(
        (f) =>
          (severity === 'all' || f.severity === severity) &&
          (status === 'all' || f.status === status) &&
          (category === 'all' || f.category === category),
      ),
    [findings, severity, status, category],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded border px-2 py-1"
        >
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-2 py-1"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border px-2 py-1"
        >
          <option value="all">All categories</option>
          {categories(findings).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="self-center text-xs text-neutral-500">
          {filtered.length} of {findings.length}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-neutral-500">No findings match this filter.</p>
      )}

      <ul className="space-y-2">
        {filtered.map((finding) => (
          <li key={finding.id} className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <span className="font-medium">{finding.title}</span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {finding.source}/{finding.ruleId} &middot; {finding.category} &middot;{' '}
              {finding.status}
            </div>
            <p className="mt-2 text-sm">{finding.recommendedFix}</p>
            {finding.locations.map((loc, i) => (
              <div key={i} className="mt-1 font-mono text-xs text-neutral-500">
                {loc.filePath}:{loc.startLine}
              </div>
            ))}

            {finding.ai ? (
              <div className="mt-2 rounded bg-purple-50 p-2 text-sm dark:bg-purple-950">
                <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                  Automated analysis
                </div>
                <p>{finding.ai.plainEnglishExplanation}</p>
                <p className="mt-1">
                  <strong>Business impact:</strong> {finding.ai.businessImpact}
                </p>
              </div>
            ) : (
              <div className="mt-2 text-xs italic text-neutral-400">
                Automated analysis not available for this finding.
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
