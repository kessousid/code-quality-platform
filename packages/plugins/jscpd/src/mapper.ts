import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative } from 'node:path';
import type { Finding, PluginContext, Severity } from '@cqp/core';
import type { JscpdDuplicate } from './jscpd-output.js';

function severityFromSize(lines: number): Severity {
  if (lines >= 50) return 'high';
  if (lines >= 20) return 'medium';
  return 'low';
}

function toRelativePath(repoRoot: string, name: string): string {
  const absolute = isAbsolute(name) ? name : join(repoRoot, name);
  return relative(repoRoot, absolute).replace(/\\/g, '/');
}

export function mapJscpdDuplicate(duplicate: JscpdDuplicate, context: PluginContext): Finding {
  const firstPath = toRelativePath(context.target.repoRoot, duplicate.firstFile.name);
  const secondPath = toRelativePath(context.target.repoRoot, duplicate.secondFile.name);

  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category: 'code-quality',
    source: 'jscpd',
    ruleId: 'duplicate-code',
    title: `Duplicated code block (${duplicate.lines} lines) between ${firstPath} and ${secondPath}`,
    severity: severityFromSize(duplicate.lines),
    // Token-based structural matching — deterministic, not heuristic.
    confidence: 'high',
    locations: [
      {
        filePath: firstPath,
        startLine: duplicate.firstFile.start,
        endLine: duplicate.firstFile.end,
      },
      {
        filePath: secondPath,
        startLine: duplicate.secondFile.start,
        endLine: duplicate.secondFile.end,
      },
    ],
    rootCause: `${duplicate.lines} lines (${duplicate.tokens} tokens) of near-identical code appear in both locations.`,
    riskDescription:
      'Duplicated logic has to be found and fixed in every copy when a bug is discovered, and copies silently drift apart over time.',
    recommendedFix: 'Extract the shared logic into a single reusable function or module.',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
  };
}
