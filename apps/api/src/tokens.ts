/**
 * DI tokens for domain repository ports (ADR-0010) — interfaces have no
 * runtime value to inject by, so each port gets a Symbol. Centralized here
 * so every module wiring a Prisma adapter to a port agrees on the same
 * token instead of each module inventing its own.
 */
export const SCAN_REPOSITORY = Symbol('SCAN_REPOSITORY');
export const REPO_REPOSITORY = Symbol('REPO_REPOSITORY');
export const FINDING_REPOSITORY = Symbol('FINDING_REPOSITORY');
export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
export const API_TOKEN_REPOSITORY = Symbol('API_TOKEN_REPOSITORY');
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
/** A per-workerId registry, not a single queue (see docs/adr/0031) — renamed from SCAN_QUEUE when routing landed. */
export const SCAN_QUEUE_REGISTRY = Symbol('SCAN_QUEUE_REGISTRY');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const ORG_REPOSITORY = Symbol('ORG_REPOSITORY');
export const UNIT_TEST_RUN_REPOSITORY = Symbol('UNIT_TEST_RUN_REPOSITORY');
export const GENERATED_TEST_FILE_REPOSITORY = Symbol('GENERATED_TEST_FILE_REPOSITORY');
export const TEST_CASE_RESULT_REPOSITORY = Symbol('TEST_CASE_RESULT_REPOSITORY');
/** A per-workerId registry, not a single queue (see docs/adr/0031) — renamed from UNIT_TEST_QUEUE when routing landed. */
export const UNIT_TEST_QUEUE_REGISTRY = Symbol('UNIT_TEST_QUEUE_REGISTRY');
export const UNIT_TEST_REPORT_REPOSITORY = Symbol('UNIT_TEST_REPORT_REPOSITORY');
export const COVERAGE_RUN_REPOSITORY = Symbol('COVERAGE_RUN_REPOSITORY');
export const COVERAGE_FILE_RESULT_REPOSITORY = Symbol('COVERAGE_FILE_RESULT_REPOSITORY');
/** A per-workerId registry, not a single queue (see docs/adr/0031) — renamed from COVERAGE_QUEUE when routing landed. */
export const COVERAGE_QUEUE_REGISTRY = Symbol('COVERAGE_QUEUE_REGISTRY');
export const COVERAGE_REPORT_REPOSITORY = Symbol('COVERAGE_REPORT_REPOSITORY');
/** A per-workerId registry for the folder-picker's request/response round trip (see docs/adr/0032). */
export const DIRECTORY_BROWSE_QUEUE_REGISTRY = Symbol('DIRECTORY_BROWSE_QUEUE_REGISTRY');
export const CRON_RUN_REPOSITORY = Symbol('CRON_RUN_REPOSITORY');
/** Real outbound HTTP call to the external COD platform, not a queue (see docs/adr/0033). */
export const CRON_EXECUTOR = Symbol('CRON_EXECUTOR');
export const QA_AUTOMATION_RUN_REPOSITORY = Symbol('QA_AUTOMATION_RUN_REPOSITORY');
export const QA_AUTOMATION_TEST_RESULT_REPOSITORY = Symbol('QA_AUTOMATION_TEST_RESULT_REPOSITORY');
export const QA_AUTOMATION_SCHEDULE_REPOSITORY = Symbol('QA_AUTOMATION_SCHEDULE_REPOSITORY');
/** The raw BullMQ producer Queue itself (not a port) — apps/api calls its real upsertJobScheduler/removeJobScheduler directly (see docs/adr/0035). */
export const QA_AUTOMATION_QUEUE = Symbol('QA_AUTOMATION_QUEUE');
