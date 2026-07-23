import type { CoverageFileResult } from '@cqp/core';
import type { CoverageReportGenerator } from '../coverage-generator.js';
import type { CoverageReportModel } from '../coverage-report-model.js';

const STATUS_ORDER: CoverageFileResult['status'][] = ['uncovered', 'covered'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFileResult(result: CoverageFileResult): string {
  return `
    <details class="result result-${result.status}" ${result.status === 'uncovered' ? 'open' : ''}>
      <summary>
        <span class="badge badge-${result.status}">${escapeHtml(result.status)}</span>
        <strong>${escapeHtml(result.filePath)}</strong>
        <span class="muted">(${result.changedLines.length} changed line${result.changedLines.length === 1 ? '' : 's'})</span>
      </summary>
      ${
        result.uncoveredLines.length > 0
          ? `<p class="muted">Uncovered lines: ${result.uncoveredLines.join(', ')}</p>`
          : '<p class="muted">Every changed line is covered.</p>'
      }
    </details>`;
}

const STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; color: #1a1a1a; background: #fafafa; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  .meta { color: #555; font-size: 0.9rem; }
  .verdict { padding: 1rem 1.5rem; border-radius: 8px; font-size: 1.1rem; font-weight: 600; margin: 1rem 0; }
  .verdict-passed { background: #dcfce7; color: #166534; }
  .verdict-failed { background: #fee2e2; color: #991b1b; }
  .tiles { display: flex; gap: 1rem; margin: 1rem 0; flex-wrap: wrap; }
  .tile { padding: 1rem 1.5rem; border-radius: 8px; text-align: center; min-width: 100px; background: #e5e7eb; }
  .tile-value { font-size: 1.75rem; font-weight: bold; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem; }
  .badge-covered { background: #dcfce7; color: #166534; }
  .badge-uncovered { background: #fee2e2; color: #991b1b; }
  .result { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
  .result summary { cursor: pointer; }
  .muted { color: #888; font-size: 0.85rem; }
`;

/** Mirrors HtmlUnitTestReportGenerator exactly — one self-contained file, no client-side JS, native `<details>` disclosure. */
export class HtmlCoverageReportGenerator implements CoverageReportGenerator {
  readonly format = 'html' as const;

  async generate(model: CoverageReportModel): Promise<string> {
    const { run, fileResults, generatedAt } = model;
    const sortedResults = [...fileResults].sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    );
    const gatePassed = run.gatePassed ?? false;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Coverage Gate Report — ${escapeHtml(run.baseRef)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="container">
    <h1>Coverage Gate Report</h1>
    <p class="meta">
      Base ref: <strong>${escapeHtml(run.baseRef)}</strong> &middot;
      Run: <code>${escapeHtml(run.id)}</code> (${escapeHtml(run.status)}) &middot;
      Generated: ${generatedAt.toISOString()}
    </p>

    <div class="verdict ${gatePassed ? 'verdict-passed' : 'verdict-failed'}">
      ${
        gatePassed
          ? 'Gate passed — every changed line is covered and all tests pass.'
          : `Gate failed — ${run.uncoveredLinesTotal ?? 0} of ${run.changedLinesTotal ?? 0} changed line(s) uncovered${
              (run.testsFailed ?? 0) > 0 ? `, ${run.testsFailed} test(s) failing` : ''
            }.`
      }
    </div>

    <div class="tiles">
      <div class="tile"><div class="tile-value">${run.testsTotal ?? 0}</div>Tests total</div>
      <div class="tile"><div class="tile-value">${run.testsPassed ?? 0}</div>Tests passed</div>
      <div class="tile"><div class="tile-value">${run.testsFailed ?? 0}</div>Tests failed</div>
      <div class="tile"><div class="tile-value">${run.changedLinesTotal ?? 0}</div>Changed lines</div>
      <div class="tile"><div class="tile-value">${run.uncoveredLinesTotal ?? 0}</div>Uncovered lines</div>
    </div>

    <h2>Changed files (${fileResults.length})</h2>
    ${sortedResults.map(renderFileResult).join('\n')}
  </div>
</body>
</html>`;
  }
}
