/**
 * Domain type + repository port for QaAutomationRun (see docs/adr/0035).
 * Mirrors Scan's shape (docs/adr/0010) — one run = the whole registered
 * suite executing once; child TestResult rows record each test's own
 * outcome, same split as Scan/Finding.
 */
import type { PaginatedResult, PaginationParams } from './pagination.js';

export type QaAutomationRunStatus = 'running' | 'completed' | 'failed';

export type QaAutomationTrigger = 'scheduled' | 'manual';

export interface QaAutomationRun {
  id: string;
  orgId: string;
  status: QaAutomationRunStatus;
  triggeredBy: QaAutomationTrigger;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface QaAutomationTestResult {
  id: string;
  runId: string;
  testId: string;
  testName: string;
  passed: boolean;
  details: string;
  createdAt: Date;
}

export interface CreateQaAutomationRunInput {
  orgId: string;
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
}

export interface QaAutomationRunRepository {
  create(input: CreateQaAutomationRunInput): Promise<QaAutomationRun>;
  findById(orgId: string, id: string): Promise<QaAutomationRun | null>;
  /** Newest first — the run-history view. */
  list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<QaAutomationRun>>;
  /** Stamps completedAt on the terminal transition — same idempotent shape as ScanRepository.updateStatus. */
  complete(
    orgId: string,
    id: string,
    input: CompleteQaAutomationRunInput,
  ): Promise<QaAutomationRun>;
}

export interface QaAutomationTestResultRepository {
  create(input: CreateQaAutomationTestResultInput): Promise<QaAutomationTestResult>;
  listByRun(runId: string): Promise<QaAutomationTestResult[]>;
}

/**
 * Single-row config — the whole point (docs/adr/0035) is that the interval
 * is adjustable at runtime, not fixed at deploy time. `lastDailyCheckAt`
 * tracks the `'daily'`-frequency tests independently of the interval
 * itself (see PortalAutomationTest in @cqp/qa-automation-tests).
 */
export interface QaAutomationSchedule {
  intervalHours: number;
  enabled: boolean;
  lastDailyCheckAt?: Date;
}

export interface UpdateQaAutomationScheduleInput {
  intervalHours?: number;
  enabled?: boolean;
  lastDailyCheckAt?: Date;
}

export interface QaAutomationScheduleRepository {
  /** Creates the single default row on first read if none exists yet. */
  get(orgId: string): Promise<QaAutomationSchedule>;
  update(orgId: string, input: UpdateQaAutomationScheduleInput): Promise<QaAutomationSchedule>;
}
