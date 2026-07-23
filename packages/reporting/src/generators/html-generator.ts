import type { AnalysisCategory, Finding, Severity } from '@cqp/core';
import type { ReportGenerator } from '../generator.js';
import type { ReportModel } from '../report-model.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function healthTone(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

function renderSeverityCounts(bySeverity: Record<Severity, number>): string {
  return SEVERITY_ORDER.map(
    (severity) =>
      `<span class="badge badge-${severity}">${escapeHtml(severity)}: ${bySeverity[severity]}</span>`,
  ).join('\n');
}

function renderCategoryCounts(byCategory: Partial<Record<AnalysisCategory, number>>): string {
  const entries = Object.entries(byCategory) as [AnalysisCategory, number][];
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `<li>${escapeHtml(category)}: ${count}</li>`)
    .join('\n');
}

function renderFinding(finding: Finding): string {
  const locations = finding.locations
    .map(
      (loc) =>
        `<li><code>${escapeHtml(loc.filePath)}:${loc.startLine}${
          loc.endLine !== undefined ? `-${loc.endLine}` : ''
        }</code></li>`,
    )
    .join('\n');

  const references = finding.references
    .map((ref) => `<li><a href="${escapeHtml(ref.url)}">${escapeHtml(ref.title)}</a></li>`)
    .join('\n');

  return `
    <details class="finding finding-${finding.severity}">
      <summary>
        <span class="badge badge-${finding.severity}">${escapeHtml(finding.severity)}</span>
        ${escapeHtml(finding.title)}
        <span class="muted">(${escapeHtml(finding.source)}/${escapeHtml(finding.ruleId)})</span>
      </summary>
      <div class="finding-body">
        <p><strong>Root cause:</strong> ${escapeHtml(finding.rootCause)}</p>
        <p><strong>Risk:</strong> ${escapeHtml(finding.riskDescription)}</p>
        <p><strong>Recommended fix:</strong> ${escapeHtml(finding.recommendedFix)}</p>
        <p><strong>Locations:</strong></p>
        <ul>${locations}</ul>
        ${references ? `<p><strong>References:</strong></p><ul>${references}</ul>` : ''}
        ${finding.ai ? renderAutomatedAnalysis(finding.ai) : ''}
      </div>
    </details>`;
}

/** Rule-based, not an LLM — see docs/adr/0020. Labeled "Automated analysis" so the report never implies AI involvement. */
function renderAutomatedAnalysis(ai: NonNullable<Finding['ai']>): string {
  return `
        <div class="ai-panel">
          <p class="ai-panel-title">Automated analysis</p>
          <p>${escapeHtml(ai.plainEnglishExplanation)}</p>
          <p><strong>Business impact:</strong> ${escapeHtml(ai.businessImpact)}</p>
        </div>`;
}

const STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; color: #1a1a1a; background: #fafafa; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
  .meta { color: #555; font-size: 0.9rem; }
  .score-tile { display: inline-block; padding: 1rem 1.5rem; border-radius: 8px; margin: 1rem 0; font-size: 2rem; font-weight: bold; }
  .score-good { background: #dcfce7; color: #166534; }
  .score-warning { background: #fef9c3; color: #854d0e; }
  .score-critical { background: #fee2e2; color: #991b1b; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem; }
  .badge-critical { background: #fee2e2; color: #991b1b; }
  .badge-high { background: #ffedd5; color: #9a3412; }
  .badge-medium { background: #fef9c3; color: #854d0e; }
  .badge-low { background: #dbeafe; color: #1e40af; }
  .badge-info { background: #e5e7eb; color: #374151; }
  .finding { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; background: white; }
  .finding summary { cursor: pointer; }
  .finding-body { margin-top: 0.75rem; font-size: 0.9rem; }
  .muted { color: #888; font-size: 0.85rem; }
  .ai-panel { margin-top: 0.5rem; padding: 0.5rem; border-radius: 4px; background: #f5f3ff; }
  .ai-panel-title { margin: 0 0 0.25rem; font-size: 0.75rem; font-weight: 700; color: #6d28d9; text-transform: uppercase; }
`;

/**
 * One self-contained file, no client-side JS — "interactive" means native
 * `<details>` disclosure. Executive summary and developer detail are
 * sections of the same document (see docs/adr/0019), not separate files.
 */
export class HtmlReportGenerator implements ReportGenerator {
  readonly format = 'html' as const;

  async generate(model: ReportModel): Promise<string> {
    const { scan, repo, summary, findings, generatedAt } = model;
    const sortedFindings = [...findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Code Quality Report — ${escapeHtml(repo.name)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="container">
    <h1>Code Quality &amp; Security Report</h1>
    <p class="meta">
      Repo: <strong>${escapeHtml(repo.name)}</strong> &middot;
      Scan: <code>${escapeHtml(scan.id)}</code> (${escapeHtml(scan.ref)}, ${escapeHtml(scan.mode)}) &middot;
      Generated: ${generatedAt.toISOString()}
    </p>

    <h2>Executive summary</h2>
    <div class="score-tile score-${healthTone(summary.healthScore)}">${summary.healthScore} / 100</div>
    <p>${summary.totalFindings} total findings, ${summary.openFindings} currently open.</p>
    <p>${renderSeverityCounts(summary.bySeverity)}</p>
    <p><strong>By category:</strong></p>
    <ul>${renderCategoryCounts(summary.byCategory)}</ul>

    <h2>Developer detail (${sortedFindings.length} findings)</h2>
    ${sortedFindings.map(renderFinding).join('\n')}
  </div>
</body>
</html>`;
  }
}
