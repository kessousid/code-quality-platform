import type { TestCaseResult } from '@cqp/core';
import type { UnitTestReportGenerator } from '../unit-test-generator.js';
import type { UnitTestReportModel } from '../unit-test-report-model.js';

const STATUS_ORDER: TestCaseResult['status'][] = ['failed', 'passed', 'skipped'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderResult(result: TestCaseResult): string {
  return `
    <details class="result result-${result.status}" ${result.status === 'failed' ? 'open' : ''}>
      <summary>
        <span class="badge badge-${result.status}">${escapeHtml(result.status)}</span>
        ${escapeHtml(result.testName)}
        <span class="muted">(${escapeHtml(result.testFilePath)}${
          result.durationMs !== undefined ? `, ${result.durationMs}ms` : ''
        })</span>
      </summary>
      ${result.failureMessage ? `<pre class="failure">${escapeHtml(result.failureMessage)}</pre>` : ''}
    </details>`;
}

const STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; color: #1a1a1a; background: #fafafa; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  .meta { color: #555; font-size: 0.9rem; }
  .tiles { display: flex; gap: 1rem; margin: 1rem 0; }
  .tile { padding: 1rem 1.5rem; border-radius: 8px; text-align: center; min-width: 100px; }
  .tile-total { background: #e5e7eb; }
  .tile-passed { background: #dcfce7; color: #166534; }
  .tile-failed { background: #fee2e2; color: #991b1b; }
  .tile-value { font-size: 1.75rem; font-weight: bold; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem; }
  .badge-passed { background: #dcfce7; color: #166534; }
  .badge-failed { background: #fee2e2; color: #991b1b; }
  .badge-skipped { background: #e5e7eb; color: #374151; }
  .result { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
  .result summary { cursor: pointer; }
  .muted { color: #888; font-size: 0.85rem; }
  .failure { margin-top: 0.5rem; padding: 0.5rem; border-radius: 4px; background: #fef2f2; color: #991b1b; font-size: 0.8rem; overflow-x: auto; white-space: pre-wrap; }
  ul.files { padding-left: 1.25rem; }
`;

/** Mirrors HtmlReportGenerator exactly — one self-contained file, no client-side JS, native `<details>` disclosure. */
export class HtmlUnitTestReportGenerator implements UnitTestReportGenerator {
  readonly format = 'html' as const;

  async generate(model: UnitTestReportModel): Promise<string> {
    const { run, generatedFiles, results, generatedAt } = model;
    const sortedResults = [...results].sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    );

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Unit Test Report — ${escapeHtml(run.target.path)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="container">
    <h1>Unit Test Report</h1>
    <p class="meta">
      Target: <strong>${escapeHtml(run.target.path)}</strong>${
        run.target.functionName ? ` :: ${escapeHtml(run.target.functionName)}` : ''
      } &middot;
      Run: <code>${escapeHtml(run.id)}</code> (${escapeHtml(run.status)}) &middot;
      Generated: ${generatedAt.toISOString()}
    </p>

    <div class="tiles">
      <div class="tile tile-total"><div class="tile-value">${run.testsTotal ?? 0}</div>Total</div>
      <div class="tile tile-passed"><div class="tile-value">${run.testsPassed ?? 0}</div>Passed</div>
      <div class="tile tile-failed"><div class="tile-value">${run.testsFailed ?? 0}</div>Failed</div>
    </div>

    <h2>Generated files (${generatedFiles.length})</h2>
    <ul class="files">
      ${generatedFiles
        .map(
          (f) =>
            `<li>${escapeHtml(f.sourceFilePath)} &rarr; <code>${escapeHtml(f.testFilePath)}</code></li>`,
        )
        .join('\n')}
    </ul>

    <h2>Test results (${results.length})</h2>
    ${sortedResults.map(renderResult).join('\n')}
  </div>
</body>
</html>`;
  }
}
