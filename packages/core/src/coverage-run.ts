/**
 * Domain type + repository port for CoverageRun (docs/adr/0025) — a
 * zero-LLM gate that diffs a repo's working tree against a base ref, runs
 * its own existing Jest suite with `--coverage`, and fails if any changed
 * line lacks coverage or any test is failing. Mirrors UnitTestRun's
 * lifecycle/progress/cancellation shape (ADR-0021, ADR-0023, ADR-0024)
 * since the problem is structurally the same: a long-running worker job
 * with live progress and a cooperative cancel.
 */
import type { PaginatedResult, PaginationParams } from './pagination.js';

export type CoverageRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CoverageRun {
  id: string;
  orgId: string;
  repoId: string;
  /** Resolved at creation time (input.baseRef ?? repo.defaultBranch) and stored, so history stays accurate even if defaultBranch later changes. */
  baseRef: string;
  status: CoverageRunStatus;
  /** undefined until the run reaches 'completed' — the gate's verdict: zero uncovered changed lines AND zero failing tests. */
  gatePassed?: boolean;
  /** Changed source files being analyzed, not "all files in the repo." */
  filesTotal?: number;
  filesCompleted?: number;
  currentFilePath?: string;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  changedLinesTotal?: number;
  uncoveredLinesTotal?: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface CreateCoverageRunInput {
  orgId: string;
  repoId: string;
  /** Optional — CreateCoverageRunUseCase resolves this to repo.defaultBranch before persisting if omitted. */
  baseRef?: string;
}

export interface CoverageRunProgress {
  filesTotal?: number;
  filesCompleted?: number;
  currentFilePath?: string | null;
}

export interface CoverageRunResultsSummary {
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  changedLinesTotal: number;
  uncoveredLinesTotal: number;
  gatePassed: boolean;
}

export interface CoverageRunRepository {
  /** `baseRef` must already be resolved (input.baseRef ?? repo.defaultBranch) by the caller before persisting. */
  create(input: CreateCoverageRunInput & { baseRef: string }): Promise<CoverageRun>;
  findById(orgId: string, id: string): Promise<CoverageRun | null>;
  /** Newest first. */
  listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CoverageRun>>;
  /** Stamps startedAt/completedAt the same way UnitTestRunRepository.updateStatus does. `errorMessage` is only meaningful on a transition to 'failed'. */
  updateStatus(
    orgId: string,
    id: string,
    status: CoverageRunStatus,
    errorMessage?: string,
  ): Promise<CoverageRun>;
  updateProgress(orgId: string, id: string, progress: CoverageRunProgress): Promise<CoverageRun>;
  updateResultsSummary(
    orgId: string,
    id: string,
    summary: CoverageRunResultsSummary,
  ): Promise<CoverageRun>;
}
