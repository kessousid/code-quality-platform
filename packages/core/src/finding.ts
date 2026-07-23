/**
 * The normalized shape every analyzer plugin must emit. This is the contract
 * that lets the correlation engine and AI layer operate on one model instead
 * of N per-engine formats (see docs/adr/0001-orchestrate-existing-engines.md).
 *
 * Phase 2 scope: types only. Validation, persistence, and correlation logic
 * land in later phases (4, 5, 7).
 */
import type { PaginatedResult, PaginationParams } from './pagination.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

export type AnalysisCategory =
  | 'code-quality'
  | 'security'
  | 'dependency-vulnerability'
  | 'secret-detection'
  | 'architecture'
  | 'performance'
  | 'database'
  | 'devops-iac'
  | 'test-coverage'
  | 'documentation'
  | 'best-practices'
  | 'technical-debt';

export interface CodeLocation {
  filePath: string;
  startLine: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
}

export interface FindingReference {
  title: string;
  url: string;
}

/**
 * Populated by the AI enrichment pass (Phase 8). Absent on a finding that
 * has not yet been through AI enrichment — plugins never populate this
 * themselves.
 */
export interface AiEnrichment {
  plainEnglishExplanation: string;
  businessImpact: string;
  suggestedPatch?: string;
  patchConfidence?: Confidence;
  relatedFindingIds: string[];
}

export interface Finding {
  id: string;
  scanId: string;
  /** Denormalized for tenant-scoped queries, consistent with Repo/Scan — see docs/adr/0009. */
  orgId: string;
  /** Findings are scoped to a Repo, not a Scan — see docs/adr/0009-database-schema-design.md. */
  repoId: string;
  category: AnalysisCategory;

  /** Which analyzer plugin produced this finding, e.g. "semgrep", "gitleaks". */
  source: string;

  /** The plugin's own rule/check identifier, for traceability back to the engine. */
  ruleId: string;

  title: string;
  severity: Severity;
  confidence: Confidence;

  cwe?: string;
  owaspCategory?: string;

  locations: CodeLocation[];

  rootCause: string;
  riskDescription: string;
  recommendedFix: string;
  exampleCode?: string;
  references: FindingReference[];

  ai?: AiEnrichment;

  /**
   * Whether a human confirmed a suggested patch was turned into a real PR.
   * The platform never sets this to true on its own — see
   * docs/adr/0004-human-in-the-loop-for-ai-patches-and-prs.md.
   */
  patchPrConfirmedByUser: boolean;

  firstSeenScanId: string;
  lastSeenScanId: string;
  status: 'open' | 'fixed' | 'ignored' | 'false-positive';
}

/** See docs/adr/0015-pagination-and-filtering.md — every field optional, all query-string-validated at the boundary. */
export interface FindingFilter {
  repoId?: string;
  severity?: Severity;
  status?: Finding['status'];
  category?: AnalysisCategory;
}

/**
 * What a scan-engine plugin actually produces for one finding, plus the
 * fingerprint the caller (see docs/adr/0021) computed from it — everything
 * `upsertFromScan` needs to either update an existing `Finding` row or
 * insert a new one. Deliberately not the full `Finding` type: `id`,
 * `firstSeenScanId`/`lastSeenScanId`, and `status` are the repository's
 * job to decide on upsert, not the caller's.
 */
export interface UpsertFindingInput {
  orgId: string;
  repoId: string;
  scanId: string;
  fingerprint: string;
  category: AnalysisCategory;
  source: string;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  cwe?: string;
  owaspCategory?: string;
  locations: CodeLocation[];
  rootCause: string;
  riskDescription: string;
  recommendedFix: string;
  exampleCode?: string;
  references: FindingReference[];
}

export interface FindingRepository {
  findById(orgId: string, id: string): Promise<Finding | null>;
  list(
    orgId: string,
    filter: FindingFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Finding>>;
  /**
   * Every finding still open as of this scan — i.e. `lastSeenScanId ===
   * scanId` (see docs/adr/0009's clarification of what `Finding.scanId`
   * means, and docs/adr/0019 for why report generation needs this).
   * Unpaginated: a report needs the complete set, not a page of it —
   * mirrors `ReportRepository.listByScan`.
   */
  listByScan(orgId: string, scanId: string): Promise<Finding[]>;
  /**
   * Match on `(repoId, fingerprint)` — update-and-reopen on a hit, insert
   * on a miss, always recording a `FindingHistory` row. See docs/adr/0021
   * for the full semantics (this closes the gap ADR-0009 flagged and left
   * for "Phase 7").
   */
  upsertFromScan(input: UpsertFindingInput): Promise<Finding>;
}
