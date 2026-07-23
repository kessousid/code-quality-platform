import type { Finding } from '@cqp/core';

interface RuleTemplate {
  /** Checked in order, first match wins — lets a specific rule's template take priority over the category fallback. */
  matches: (finding: Finding) => boolean;
  explain: (finding: Finding) => string;
}

function bySource(source: string, ruleIdIncludes: string) {
  return (finding: Finding) => finding.source === source && finding.ruleId.includes(ruleIdIncludes);
}

/**
 * Covers the real rules from Phase 7's 6 plugins we can name specifically.
 * Anything not matched here (most notably OSV-Scanner's per-CVE/GHSA rule
 * IDs, which are unbounded) falls through to the category-level template
 * below — see ADR-0020.
 */
const RULE_TEMPLATES: RuleTemplate[] = [
  {
    matches: bySource('semgrep', 'eval-detected'),
    explain: (f) =>
      `${f.title} — passing untrusted input to eval() lets an attacker run arbitrary JavaScript in this process, not just corrupt data. ${f.rootCause}`,
  },
  {
    matches: (f) => f.source === 'gitleaks',
    explain: (f) =>
      `A secret matching the pattern "${f.ruleId}" was committed to this repository's history. Anyone with read access to the repo — including outside collaborators or a leaked clone — can use it immediately. ${f.rootCause}`,
  },
  {
    matches: (f) => f.source === 'osv-scanner',
    explain: (f) =>
      `${f.title} has a publicly disclosed vulnerability (${f.ruleId}). Because the advisory is public, exploit code or scanners targeting it may already exist. ${f.recommendedFix}`,
  },
  {
    matches: bySource('eslint', 'no-undef'),
    explain: (f) =>
      `${f.title} — this reference isn't declared anywhere ESLint can see, which usually means either a typo or a missing import; either way it will throw at runtime, not just at lint time. Location: ${f.locations[0]?.filePath}:${f.locations[0]?.startLine}.`,
  },
  {
    matches: bySource('eslint', 'no-unused-vars'),
    explain: () =>
      `An unused variable doesn't break anything by itself, but it's frequently a sign of a bug nearby — code that was meant to use this value but doesn't, or a leftover from a refactor.`,
  },
  {
    matches: (f) => f.source === 'jscpd',
    explain: (f) => `${f.rootCause} ${f.riskDescription}`,
  },
  {
    matches: (f) => f.source === 'dependency-graph' && f.ruleId === 'circular-dependency',
    explain: (f) =>
      `${f.title} — modules that depend on each other in a cycle can't be understood, tested, or safely refactored in isolation; a change to either side risks breaking the other. ${f.riskDescription}`,
  },
];

/** Category-level fallback when no specific rule template matches — reframes the plugin's own text rather than inventing new claims about code this engine never read. */
function explainByCategory(finding: Finding): string {
  return `${finding.title}. ${finding.rootCause} ${finding.riskDescription}`.trim();
}

export function explainFinding(finding: Finding): string {
  const template = RULE_TEMPLATES.find((t) => t.matches(finding));
  return template ? template.explain(finding) : explainByCategory(finding);
}
