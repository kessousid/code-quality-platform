import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import type { AnalysisCategory, Finding, PluginContext, Severity } from '@cqp/core';
import type { SemgrepResult } from './semgrep-output.js';

const SEVERITY_MAP: Record<SemgrepResult['extra']['severity'], Severity> = {
  ERROR: 'high',
  WARNING: 'medium',
  INFO: 'low',
};

const CATEGORY_MAP: Record<string, AnalysisCategory> = {
  security: 'security',
  correctness: 'code-quality',
  'best-practice': 'best-practices',
  maintainability: 'code-quality',
  performance: 'performance',
};

/** Rule short name from a dotted check_id, e.g. "eval-detected" -> "Eval detected". */
function humanizeRuleName(checkId: string): string {
  const shortName = checkId.split('.').pop() ?? checkId;
  const words = shortName.split('-');
  return words.length > 0
    ? `${words[0]!.charAt(0).toUpperCase()}${words[0]!.slice(1)} ${words.slice(1).join(' ')}`.trim()
    : shortName;
}

export function mapSemgrepResult(result: SemgrepResult, context: PluginContext): Finding {
  const metadata = result.extra.metadata;
  const category = CATEGORY_MAP[metadata?.category ?? ''] ?? 'security';
  const confidence = metadata?.confidence?.toLowerCase() as Finding['confidence'] | undefined;

  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category,
    source: 'semgrep',
    ruleId: result.check_id,
    title: humanizeRuleName(result.check_id),
    severity: SEVERITY_MAP[result.extra.severity],
    confidence: confidence ?? 'medium',
    locations: [
      {
        filePath: relative(context.target.repoRoot, result.path).replace(/\\/g, '/'),
        startLine: result.start.line,
        endLine: result.end.line,
        startColumn: result.start.col,
        endColumn: result.end.col,
      },
    ],
    rootCause: result.extra.message,
    riskDescription: result.extra.message,
    recommendedFix: 'See the references below for remediation guidance for this rule.',
    references: (metadata?.references ?? []).map((url) => ({ title: url, url })),
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
    ...(metadata?.cwe?.[0] !== undefined ? { cwe: metadata.cwe[0] } : {}),
    ...(metadata?.owasp?.[0] !== undefined ? { owaspCategory: metadata.owasp[0] } : {}),
  };
}
