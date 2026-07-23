import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import type { Confidence, Finding, PluginContext } from '@cqp/core';
import type { GitleaksFinding } from './gitleaks-output.js';

/**
 * A secret-detection tool that echoes the plaintext secret it found into
 * its own report is itself a smell — this is the one thing this mapper
 * refuses to pass through verbatim, regardless of how it's used
 * downstream (reports, AI enrichment prompts, dashboards).
 */
function redact(secret: string): string {
  if (secret.length <= 8) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, 4)}${'*'.repeat(secret.length - 8)}${secret.slice(-4)}`;
}

function confidenceFromEntropy(entropy: number): Confidence {
  if (entropy >= 4.5) return 'high';
  if (entropy >= 3.5) return 'medium';
  return 'low';
}

export function mapGitleaksFinding(finding: GitleaksFinding, context: PluginContext): Finding {
  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category: 'secret-detection',
    source: 'gitleaks',
    ruleId: finding.RuleID,
    title: finding.Description,
    // Every real leaked credential is treated as critical — see docs/adr
    // for this platform's own scan target having exactly this class of
    // finding confirmed non-placeholder in the Semgrep/Rudra comparison.
    severity: 'critical',
    confidence: confidenceFromEntropy(finding.Entropy),
    locations: [
      {
        filePath: relative(context.target.repoRoot, finding.File).replace(/\\/g, '/'),
        startLine: finding.StartLine,
        endLine: finding.EndLine,
        startColumn: finding.StartColumn,
        endColumn: finding.EndColumn,
      },
    ],
    rootCause: finding.Description,
    riskDescription: `A credential matching "${finding.RuleID}" is committed to source control. Redacted match: ${redact(finding.Secret)}`,
    recommendedFix:
      'Revoke and rotate this credential immediately, then remove it from source control history (not just the current commit).',
    exampleCode: redact(finding.Secret),
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
  };
}
