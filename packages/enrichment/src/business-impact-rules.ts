import type { AnalysisCategory, Finding, Severity } from '@cqp/core';

/**
 * The genuinely new value this layer adds over what a plugin already
 * outputs (see ADR-0020) — plugins speak in rule-id/CWE terms, not "what
 * does an unresolved instance of this cost the business." A
 * `category x severity` matrix, not per-rule, since business impact is a
 * function of what kind of problem it is and how bad it is, not which
 * specific tool/rule flagged it.
 */
const IMPACT_BY_CATEGORY: Record<AnalysisCategory, (severity: Severity) => string> = {
  security: (s) =>
    s === 'critical' || s === 'high'
      ? 'Left unresolved, this could let an attacker access, modify, or exfiltrate data — a breach at this severity typically means incident response, customer notification, and regulatory exposure, not just an engineering fix.'
      : 'A lower-severity security gap on its own may not be directly exploitable, but it narrows the effort needed for a more serious attack chained on top of it.',
  'secret-detection': () =>
    "A leaked credential is immediately usable by anyone who can read it — the cost isn't \"if\" it gets used, it's how much access it grants until it's rotated. Treat this as urgent regardless of where the secret was found.",
  'dependency-vulnerability': (s) =>
    s === 'critical' || s === 'high'
      ? 'This dependency has a known, publicly disclosed vulnerability — the fix is usually a version bump, so the cost of ignoring it (a future incident) is disproportionate to the cost of resolving it now.'
      : 'A lower-severity dependency advisory is worth tracking and fixing on a normal release cadence rather than an emergency one.',
  architecture: () =>
    'Architectural issues like this compound over time: every future change in the affected area costs more effort and carries more risk of an unintended side effect than it would in cleaner code.',
  performance: (s) =>
    s === 'critical' || s === 'high'
      ? 'A performance issue at this severity risks user-visible slowness or timeouts under load — directly affecting conversion, retention, or SLA commitments.'
      : 'A minor performance issue is unlikely to be user-visible on its own, but these tend to accumulate across a codebase.',
  database: () =>
    'Database-layer issues risk data integrity or availability — problems here are usually harder and more expensive to fix after they reach production data than before.',
  'devops-iac': (s) =>
    s === 'critical' || s === 'high'
      ? "A misconfiguration in infrastructure-as-code can expose or take down production systems the moment it's applied, not just the code that defines them."
      : 'This infrastructure configuration issue is worth correcting, but is unlikely to have immediate production impact on its own.',
  'test-coverage': () =>
    "Gaps in test coverage don't cause incidents by themselves, but they mean regressions in this area are more likely to reach production undetected.",
  documentation: () =>
    'Missing or incorrect documentation slows down every future engineer who touches this code, including the one who wrote it, six months from now.',
  'best-practices': () =>
    "This doesn't cause an incident on its own, but deviating from established practice here makes the code harder to review, maintain, and onboard new contributors to.",
  'technical-debt': () =>
    'Technical debt compounds: the longer this stays unresolved, the more code gets built on top of it, and the more expensive the eventual fix becomes.',
  'code-quality': () =>
    'This increases the ongoing cost of maintaining this code — more effort to read, test, and change safely — without necessarily being an active incident risk today.',
};

export function estimateBusinessImpact(finding: Finding): string {
  return IMPACT_BY_CATEGORY[finding.category](finding.severity);
}
