/**
 * Domain type + repository port for QaAutomationRun (see docs/adr/0035).
 * Mirrors Scan's shape (docs/adr/0010) — one run = the whole registered
 * suite executing once; child TestResult rows record each test's own
 * outcome, same split as Scan/Finding.
 */
import type { PaginatedResult, PaginationParams } from './pagination.js';

export type QaAutomationRunStatus = 'running' | 'completed' | 'failed';

/**
 * User-facing wording for a run's status — shared by the web UI and the
 * generated PDF/Excel reports so both say the same thing. Per the user:
 * "completed"/"failed" read as if the *tests themselves* passed or
 * failed, when a run can complete with real per-test failures still
 * inside it — the run-level label is about whether the suite executed at
 * all, not the aggregate test outcome (that's reported separately as a
 * passed/failed count).
 */
export const QA_AUTOMATION_RUN_STATUS_LABELS: Record<QaAutomationRunStatus, string> = {
  running: 'Running',
  completed: 'Successfully Executed',
  failed: 'Failed to Execute',
};

export type QaAutomationTrigger = 'scheduled' | 'manual';

/**
 * Which environment a run actually executed against — 'production' always
 * goes through the existing TS test registry, 'staging' always goes
 * through the external pytest subprocess (see @cqp/staging-test-runner).
 * A property of the run, not of any individual test definition.
 */
export type QaAutomationEnvironment = 'production' | 'staging';

export interface QaAutomationRun {
  id: string;
  orgId: string;
  environment: QaAutomationEnvironment;
  status: QaAutomationRunStatus;
  triggeredBy: QaAutomationTrigger;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  /**
   * 0-100, only ever set for a staging run (docs/adr/0044) — parsed live
   * from pytest's own `-v` output (it already prints a running `[ NN%]`
   * per test), so a long-running suite is never indistinguishable from a
   * hung one. Undefined for production (short enough to not need it) and
   * for a staging run that hasn't produced its first result yet.
   */
  progressPercent?: number;
}

export interface QaAutomationTestResult {
  id: string;
  runId: string;
  testId: string;
  testName: string;
  passed: boolean;
  details: string;
  /** See StagingTestResult's own doc comment — only ever set for a staging run's results. */
  sourceUrl?: string;
  createdAt: Date;
}

/**
 * A pytest skip is stamped `passed: false` with a `SKIPPED: <reason>` detail
 * prefix (see @cqp/staging-test-runner's JUnit parser) — a real, third
 * outcome that's neither a pass nor a genuine failure. `passed` stays a
 * plain boolean (no schema/domain-model change), but every place that
 * counts or displays a run's results should split a skip out of "failed"
 * using this shared check, instead of treating "not passed" as "failed".
 * Shared here (rather than duplicated per-caller) so the web UI's run
 * summary and both report generators can never drift on what counts as a
 * skip.
 */
const SKIPPED_DETAIL_PREFIX = 'SKIPPED: ';

export function isSkippedTestResult(details: string): boolean {
  return details.startsWith(SKIPPED_DETAIL_PREFIX);
}

/**
 * The quarantine-stub detail prefix stamped by PytestStagingTestRunner for
 * a test deselected before it even ran (known hang, docs/adr/0055,
 * docs/adr/0056) — distinct from a real pytest skip. Re-running one of
 * these would defeat the whole point of quarantining it.
 */
const QUARANTINE_DETAIL_PREFIX = 'SKIPPED: Deselected before this run';

export function isQuarantinedTestResult(details: string): boolean {
  return details.startsWith(QUARANTINE_DETAIL_PREFIX);
}

/**
 * Bare test names (parametrize suffix stripped) presently quarantined by
 * PytestStagingTestRunner (see that class's QUARANTINED_PANELADMIN_TESTS /
 * QUARANTINED_BATCH1_TESTS) — kept manually in sync here since @cqp/core
 * can't depend on @cqp/staging-test-runner (an adapter package) without
 * breaking layering. Used by selectRerunTargets/selectQuarantinedCarryForward
 * to decide "should this test actually run in a rerun" against CURRENT
 * quarantine status, not whatever an old run's own stored result happened
 * to record. Confirmed live (2026-08-25): a "rerun failed/skipped" of a
 * run that predated an un-quarantine fix kept treating those tests as
 * quarantined forever, since the old check only looked at that one old
 * run's own historical details text, not the current list.
 */
export const CURRENTLY_QUARANTINED_TEST_NAMES: string[] = [
  'test_TC_MR_006_Shortlist_Candidate',
  'test_TC_MR_005_Shortlist_Specific_Candidate',
];

/**
 * Bare test function names (parametrize suffix like `[chromium]`
 * stripped) worth re-running from a completed staging run — every
 * non-passed result except currently-quarantined ones. Feeds
 * PytestStagingTestRunner's onlyTestNames, which re-derives the real
 * file/class location itself against a fresh clone (see
 * resolveOnlyTestNames's own doc comment for why the stored testId
 * alone can't be used for this).
 */
export function selectRerunTargets(results: QaAutomationTestResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    if (result.passed) continue;
    const bareName = result.testName.replace(/\[.*?\]$/, '');
    if (CURRENTLY_QUARANTINED_TEST_NAMES.includes(bareName)) continue;
    names.add(bareName);
  }
  return [...names];
}

/**
 * The currently-quarantined stub rows from a run being rerun
 * (selectRerunTargets' own exclusion list) -- carried forward into the
 * *new* run's own results rather than silently dropped. Per the user: a
 * rerun of "55 failed" where 16 are quarantined should still show 55
 * accounted for (39 actually rerun + 16 shown as quarantined/not rerun),
 * not quietly shrink to 39 with no record of why. Deduped by testId in
 * case the same quarantined test's stub somehow appears more than once
 * in the source run.
 */
export function selectQuarantinedCarryForward(
  results: QaAutomationTestResult[],
): Pick<QaAutomationTestResult, 'testId' | 'testName' | 'passed' | 'details' | 'sourceUrl'>[] {
  const byTestId = new Map<
    string,
    Pick<QaAutomationTestResult, 'testId' | 'testName' | 'passed' | 'details' | 'sourceUrl'>
  >();
  for (const result of results) {
    if (result.passed) continue;
    const bareName = result.testName.replace(/\[.*?\]$/, '');
    if (!CURRENTLY_QUARANTINED_TEST_NAMES.includes(bareName)) continue;
    if (byTestId.has(result.testId)) continue;
    byTestId.set(result.testId, {
      testId: result.testId,
      testName: result.testName,
      passed: result.passed,
      details: result.details,
      ...(result.sourceUrl !== undefined ? { sourceUrl: result.sourceUrl } : {}),
    });
  }
  return [...byTestId.values()];
}

export interface CreateQaAutomationRunInput {
  orgId: string;
  environment: QaAutomationEnvironment;
  triggeredBy: QaAutomationTrigger;
}

export interface CompleteQaAutomationRunInput {
  status: 'completed' | 'failed';
}

export interface CreateQaAutomationTestResultInput {
  runId: string;
  testId: string;
  testName: string;
  passed: boolean;
  details: string;
  sourceUrl?: string;
}

export interface QaAutomationRunRepository {
  create(input: CreateQaAutomationRunInput): Promise<QaAutomationRun>;
  findById(orgId: string, id: string): Promise<QaAutomationRun | null>;
  /** Newest first — the run-history view. Filters to a single environment when given. */
  list(
    orgId: string,
    pagination: PaginationParams,
    environment?: QaAutomationEnvironment,
  ): Promise<PaginatedResult<QaAutomationRun>>;
  /** Stamps completedAt on the terminal transition — same idempotent shape as ScanRepository.updateStatus. */
  complete(
    orgId: string,
    id: string,
    input: CompleteQaAutomationRunInput,
  ): Promise<QaAutomationRun>;
  /**
   * System-wide, not scoped to a single org — used only by the worker's own
   * startup reconciliation (docs/adr/0043) to find runs orphaned by a
   * container restart mid-execution. Since only one job can be actively
   * processing per queue at a time, anything still `'running'` when the
   * worker boots cannot possibly still be in progress.
   */
  findAllRunning(): Promise<QaAutomationRun[]>;
  /** See QaAutomationRun.progressPercent's own doc comment (docs/adr/0044). A no-op on an already-terminal run. */
  updateProgress(orgId: string, id: string, progressPercent: number): Promise<QaAutomationRun>;
}

export interface QaAutomationTestResultRepository {
  create(input: CreateQaAutomationTestResultInput): Promise<QaAutomationTestResult>;
  listByRun(runId: string): Promise<QaAutomationTestResult[]>;
}

/**
 * Single-row config. Per the user, production runs the whole registered
 * suite together on a fixed twice-daily cron (00:00 and 12:00 IST) —
 * not a user-adjustable interval — mirroring QaAutomationStagingSchedule's
 * shape exactly.
 */
export interface QaAutomationSchedule {
  enabled: boolean;
}

export interface UpdateQaAutomationScheduleInput {
  enabled?: boolean;
}

export interface QaAutomationScheduleRepository {
  /** Creates the single default row on first read if none exists yet. */
  get(orgId: string): Promise<QaAutomationSchedule>;
  update(orgId: string, input: UpdateQaAutomationScheduleInput): Promise<QaAutomationSchedule>;
}
