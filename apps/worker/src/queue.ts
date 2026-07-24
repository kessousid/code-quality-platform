import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { PrismaClient } from '@cqp/db';
import type {
  BrowseDirectoryRequest,
  BrowseDirectoryResult,
  CoverageJobData,
  ScanJobData,
  UnitTestJobData,
} from '@cqp/core';
import {
  createCoverageBullWorker,
  createDirectoryBrowseBullWorker,
  createScanBullWorker,
  createUnitTestBullWorker,
} from '@cqp/queue';
import { processBrowseDirectoryJob } from './jobs/browse-directory.job.js';
import { processHealthcheckJob, type HealthcheckJobData } from './jobs/healthcheck.job.js';
import { processRunScanJob } from './jobs/run-scan.job.js';
import { processRunUnitTestGenerationJob } from './jobs/run-unit-test-generation.job.js';
import { processRunCoverageGateJob } from './jobs/run-coverage-gate.job.js';

export const HEALTHCHECK_QUEUE_NAME = 'healthcheck';

/**
 * Factories, not top-level singletons — importing this module must never
 * open a Redis connection as a side effect (it would break typecheck/build/
 * test, which don't have Redis available).
 */
export function createHealthcheckQueue(connection: ConnectionOptions): Queue<HealthcheckJobData> {
  return new Queue<HealthcheckJobData>(HEALTHCHECK_QUEUE_NAME, { connection });
}

export function createHealthcheckWorker(connection: ConnectionOptions): Worker<HealthcheckJobData> {
  return new Worker<HealthcheckJobData>(
    HEALTHCHECK_QUEUE_NAME,
    async (job) => processHealthcheckJob(job.data),
    { connection },
  );
}

/**
 * Queue name/job shape shared with `apps/api`'s producer via `@cqp/queue`
 * (see docs/adr/0021). Namespaced by `workerId` (docs/adr/0031) — this
 * instance only ever consumes jobs for repos whose `localPath` lives on
 * this same machine, so a job never reaches a worker that can't see the
 * right files.
 */
export function createScanWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  workerId: string,
): Worker<ScanJobData> {
  return createScanBullWorker(
    connection,
    async (job) => processRunScanJob(prisma, job.data),
    workerId,
  );
}

/** A separate queue from scans (docs/adr/0024) — a slow, LLM-backed unit-test run never blocks scan throughput or vice versa. */
export function createUnitTestWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  workerId: string,
): Worker<UnitTestJobData> {
  return createUnitTestBullWorker(
    connection,
    async (job) => processRunUnitTestGenerationJob(prisma, job.data),
    workerId,
  );
}

/** A separate queue again (docs/adr/0025) — zero-LLM, so it's fast, but still isolated so a slow scan/unit-test run never blocks it or vice versa. */
export function createCoverageWorker(
  connection: ConnectionOptions,
  prisma: PrismaClient,
  workerId: string,
): Worker<CoverageJobData> {
  return createCoverageBullWorker(
    connection,
    async (job) => processRunCoverageGateJob(prisma, job.data),
    workerId,
  );
}

/**
 * A fourth, separate queue (docs/adr/0032) — the folder picker needs a real
 * response back (not just a fire-and-forget enqueue like the three above),
 * so this worker's return value IS the answer the API is waiting on via
 * `BullMqDirectoryBrowseQueue#browse`.
 */
export function createDirectoryBrowseWorker(
  connection: ConnectionOptions,
  workerId: string,
): Worker<BrowseDirectoryRequest, BrowseDirectoryResult> {
  return createDirectoryBrowseBullWorker(
    connection,
    async (job) => processBrowseDirectoryJob(job.data),
    workerId,
  );
}
