import type { Finding } from '@cqp/core';

/**
 * The cross-file correlation ADR-0012 deferred to "Phase 8" — now
 * implemented deterministically rather than via an LLM (see ADR-0020).
 * Two findings are related if any of their locations share a file path.
 * Deliberately simple: no dependency-graph traversal (that data isn't
 * queryable from this layer yet — see Phase 10's honest disclosure on
 * the dashboard), just "these findings touch the same file."
 */
export function correlateByFile(findings: Finding[]): Map<string, string[]> {
  const filePathsByFinding = new Map<string, Set<string>>();
  for (const finding of findings) {
    filePathsByFinding.set(finding.id, new Set(finding.locations.map((l) => l.filePath)));
  }

  const related = new Map<string, string[]>();
  for (const a of findings) {
    const aPaths = filePathsByFinding.get(a.id)!;
    const relatedIds = findings
      .filter((b) => b.id !== a.id)
      .filter((b) => [...filePathsByFinding.get(b.id)!].some((path) => aPaths.has(path)))
      .map((b) => b.id);
    related.set(a.id, relatedIds);
  }

  return related;
}
