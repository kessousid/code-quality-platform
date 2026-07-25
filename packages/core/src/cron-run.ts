import type { PaginatedResult, PaginationParams } from './pagination.js';

/** Prod deliberately excluded for now — see docs/adr/0033. */
export type CronEnvironment = 'dev' | 'staging';

export interface CronDefinition {
  id: string;
  name: string;
  /** Joined with CRON_ENVIRONMENT_BASE_URLS[environment] — every known cron is a bare POST, no body/headers. */
  path: string;
}

/**
 * Hardcoded, not DB-managed (see docs/adr/0033) — sourced from a one-off
 * Postman export of a completely separate external system's cron jobs;
 * this list changes rarely and has no admin UI need.
 */
export const CRON_DEFINITIONS: CronDefinition[] = [
  { id: 'candidate-outreach', name: 'candidate outreach CRON', path: '/api/v1/outreach/trigger' },
  {
    id: 'candidate-scoring-assign',
    name: 'candidate scoring and moving to assigned CRON',
    path: '/api/v1/cron/cod/assigncandidate/curated-noncurated',
  },
  {
    id: 'cod-candidate-search',
    name: 'get cod candidates',
    path: '/api/v1/cron/cod/candidate-search',
  },
];

export const CRON_ENVIRONMENT_BASE_URLS: Record<CronEnvironment, string> = {
  dev: 'https://curatal-dev.openturf.dev',
  staging: 'https://staging.curatal.com',
};

export type CronRunStatus = 'running' | 'succeeded' | 'failed';

export interface CronRun {
  id: string;
  orgId: string;
  cronId: string;
  /** Denormalized snapshot of CronDefinition.name at trigger time — CRON_DEFINITIONS is code, not a DB row, so nothing FKs to it. */
  cronName: string;
  environment: CronEnvironment;
  status: CronRunStatus;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  triggeredByUserId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface CreateCronRunInput {
  orgId: string;
  cronId: string;
  cronName: string;
  environment: CronEnvironment;
  triggeredByUserId?: string;
}

export interface CompleteCronRunInput {
  status: 'succeeded' | 'failed';
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
}

export interface CronRunRepository {
  create(input: CreateCronRunInput): Promise<CronRun>;
  /** Transitions a running row to a terminal status — same idempotent-timestamp shape as ScanRepository.updateStatus. */
  complete(orgId: string, id: string, input: CompleteCronRunInput): Promise<CronRun>;
  /** Newest first — org-wide history, not scoped to any repo. */
  list(orgId: string, pagination: PaginationParams): Promise<PaginatedResult<CronRun>>;
}

export interface CronExecutionResult {
  statusCode: number;
  body: string;
}

/**
 * Framework-free port (ADR-0010): the actual outbound HTTP call to the
 * external recruiting platform. Never throws on a non-2xx — that's still
 * a completed HTTP exchange, reported as CronExecutionResult; it throws
 * only on a genuine failure to complete the exchange at all (DNS/connect
 * refused/timeout).
 */
export interface CronExecutor {
  execute(definition: CronDefinition, baseUrl: string): Promise<CronExecutionResult>;
}
