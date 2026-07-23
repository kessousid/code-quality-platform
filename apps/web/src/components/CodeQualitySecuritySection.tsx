import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisCategory, ScanMode } from '@cqp/core';
import { SCAN_CATEGORIES, useCreateScan, useRepoHealthTrend, useScans } from '../api/hooks.js';
import { HealthTrendChart } from './HealthTrendChart.js';

interface CodeQualitySecuritySectionProps {
  repoId: string;
}

/** The scan-related half of a repo's page — split out so it can sit behind its own tab, clearly separate from unit-test generation (two different modules, not one blended page). */
export function CodeQualitySecuritySection({ repoId }: CodeQualitySecuritySectionProps) {
  const scansQuery = useScans(repoId);
  const trendQuery = useRepoHealthTrend(repoId);
  const createScan = useCreateScan();
  const [ref, setRef] = useState('main');
  const [mode, setMode] = useState<ScanMode>('full');
  const [categories, setCategories] = useState<AnalysisCategory[]>([]);

  function toggleCategory(category: AnalysisCategory) {
    setCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  }

  async function handleCreateScan(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createScan.mutateAsync({
        repoId,
        ref,
        mode,
        ...(categories.length > 0 ? { categories } : {}),
      });
    } catch {
      // surfaced via createScan.isError, if the UI grows one
    }
  }

  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Health trend</h2>
        {trendQuery.data && <HealthTrendChart points={trendQuery.data} />}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-600">Run a new scan</h2>
        <form onSubmit={handleCreateScan} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="ref (e.g. main)"
              className="rounded border px-3 py-2 text-sm"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ScanMode)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="full">full</option>
              <option value="incremental">incremental</option>
            </select>
            <button
              type="submit"
              disabled={createScan.isPending}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Start scan
            </button>
          </div>
          <fieldset className="flex flex-wrap gap-3 text-sm text-neutral-700">
            <legend className="mb-1 w-full text-xs text-neutral-500">
              Categories to run (none checked = run everything)
            </legend>
            {SCAN_CATEGORIES.map((category) => (
              <label key={category.value} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={categories.includes(category.value)}
                  onChange={() => toggleCategory(category.value)}
                />
                {category.label}
              </label>
            ))}
          </fieldset>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Scan history</h2>
        {scansQuery.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {scansQuery.data && scansQuery.data.data.length === 0 && (
          <p className="text-sm text-neutral-500">No scans yet.</p>
        )}
        <ul className="divide-y rounded-lg border">
          {scansQuery.data?.data.map((scan) => (
            <li key={scan.id} className="flex items-center justify-between p-3">
              <Link to={`/scans/${scan.id}`} className="text-blue-600 hover:underline">
                {scan.ref} &middot; {scan.mode}
              </Link>
              <span className="text-xs text-neutral-500">
                {scan.status}
                {scan.status === 'running' && scan.pluginsTotal !== undefined && (
                  <>
                    {' '}
                    ({scan.pluginsCompleted ?? 0}/{scan.pluginsTotal})
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
