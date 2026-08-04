/**
 * Domain type + repository port for UnitTestRun (see docs/adr/0024) — a
 * request to generate Jest tests for a target within a repo's local
 * checkout, then execute them and record the results. Mirrors Scan's
 * lifecycle/progress/cancellation shape (ADR-0021, ADR-0023) since the
 * problem is structurally the same: a long-running worker job with live
 * progress and a cooperative cancel.
 */
import type { PaginatedResult, PaginationParams } from './pagination.js';
import type { TestGeneratorType } from './jest-test-generator.js';

export type UnitTestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * `path` is relative to the repo's `localPath` — a single file or a
 * directory. `functionName` narrows generation to one exported function
 * and is only valid when `path` points at a file, not a directory.
 */
export interface UnitTestTarget {
  path: string;
  functionName?: string;
}

export interface UnitTestRun {
  id: string;
  orgId: string;
  repoId: string;
  target: UnitTestTarget;
  /** Which JestTestGenerator implementation wrote (or will write) this run's tests — see docs/adr/0026. */
  generator: TestGeneratorType;
  status: UnitTestRunStatus;
  filesTotal?: number;
  filesCompleted?: number;
  currentFilePath?: string;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface CreateUnitTestRunInput {
  orgId: string;
  repoId: string;
  target: UnitTestTarget;
  /** Defaults to 'gemini' when omitted — resolved in CreateUnitTestRunUseCase, not here. */
  generator?: TestGeneratorType;
  /**
   * A one-off Gemini API key for this run only, in case the configured
   * default key is out of quota — never persisted (deliberately absent
   * from `UnitTestRun` itself), only relayed through `UnitTestJobData` to
   * whichever worker actually runs the job (see docs/adr/0037).
   */
  apiKeyOverride?: string;
}

export interface UnitTestRunProgress {
  filesTotal?: number;
  filesCompleted?: number;
  currentFilePath?: string | null;
}

export interface UnitTestRunResultsSummary {
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
}

export interface UnitTestRunRepository {
  create(input: CreateUnitTestRunInput): Promise<UnitTestRun>;
  findById(orgId: string, id: string): Promise<UnitTestRun | null>;
  /** Newest first. */
  listByRepo(
    orgId: string,
    repoId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<UnitTestRun>>;
  /** Stamps startedAt/completedAt the same way ScanRepository.updateStatus does. `errorMessage` is only meaningful on a transition to 'failed'. */
  updateStatus(
    orgId: string,
    id: string,
    status: UnitTestRunStatus,
    errorMessage?: string,
  ): Promise<UnitTestRun>;
  updateProgress(orgId: string, id: string, progress: UnitTestRunProgress): Promise<UnitTestRun>;
  updateResultsSummary(
    orgId: string,
    id: string,
    summary: UnitTestRunResultsSummary,
  ): Promise<UnitTestRun>;
}
