import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import type { ESLint, Linter } from 'eslint';
import type { Finding, PluginContext, Severity } from '@cqp/core';

function humanizeRuleId(ruleId: string): string {
  const shortName = ruleId.split('/').pop() ?? ruleId;
  return shortName.replace(/-/g, ' ');
}

const SEVERITY_MAP: Record<Linter.Severity, Severity> = {
  0: 'info', // "off" — unreachable in practice, ESLint doesn't report off rules
  1: 'low', // warn
  2: 'medium', // error
};

export function mapEslintMessage(
  result: ESLint.LintResult,
  message: Linter.LintMessage,
  context: PluginContext,
): Finding {
  const ruleId = message.ruleId ?? 'parse-error';

  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category: 'code-quality',
    source: 'eslint',
    ruleId,
    title: humanizeRuleId(ruleId),
    severity: SEVERITY_MAP[message.severity],
    // Deterministic static rule matches — no heuristic ambiguity, unlike
    // e.g. entropy-based secret detection.
    confidence: 'high',
    locations: [
      {
        filePath: relative(context.target.repoRoot, result.filePath).replace(/\\/g, '/'),
        startLine: message.line,
        ...(message.endLine !== undefined ? { endLine: message.endLine } : {}),
        ...(message.column !== undefined ? { startColumn: message.column } : {}),
        ...(message.endColumn !== undefined ? { endColumn: message.endColumn } : {}),
      },
    ],
    rootCause: message.message,
    riskDescription: message.message,
    recommendedFix: message.fix
      ? `This rule (${ruleId}) supports automatic fixing via "eslint --fix".`
      : `Address per rule ${ruleId}'s documentation.`,
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
  };
}
