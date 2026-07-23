import type { AnalysisCategory, Finding } from './finding.js';

/**
 * Contract every analyzer adapter implements (see docs/adr/0001). The
 * orchestrator (Phase 7) knows nothing about Semgrep, ESLint, jscpd, etc.
 * individually — it only knows this interface.
 *
 * Phase 2 scope: interface only, no runtime/process-isolation logic yet.
 * That lands in Phase 5 (service architecture) and Phase 7 (scanning engine).
 */

export interface ScanTarget {
  repoRoot: string;
  /** Files to analyze on this pass; absent means "full scan of repoRoot". */
  changedFiles?: string[];
}

export interface PluginContext {
  scanId: string;
  /**
   * Added in Phase 7: Finding.orgId/repoId (added in Phase 6) must come
   * from somewhere — the orchestrator knows both when it dispatches a
   * scan, so it stamps them here rather than plugins guessing at them.
   */
  orgId: string;
  repoId: string;
  target: ScanTarget;
  /** Per-plugin timeout in milliseconds, enforced by the plugin runtime. */
  timeoutMs: number;
}

export interface AnalyzerPlugin {
  /** Unique adapter id, becomes Finding.source, e.g. "semgrep". */
  readonly id: string;

  readonly categories: AnalysisCategory[];

  /** File globs this plugin should be invoked for; empty means repo-level (e.g. dependency graph). */
  readonly applicableGlobs: string[];

  /** Returns normalized findings; throws only on infrastructure failure (e.g. binary missing), never on "no issues found". */
  run(context: PluginContext): Promise<Finding[]>;
}
