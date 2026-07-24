import { Queue, QueueEvents, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type {
  BrowseDirectoryRequest,
  BrowseDirectoryResult,
  DirectoryBrowseQueue,
  DirectoryBrowseQueueRegistry,
} from '@cqp/core';

/**
 * Mirrors scan-queue.ts's naming (docs/adr/0031, docs/adr/0032) — one real
 * queue per workerId, `-` not `:` (BullMQ rejects `:` in queue names
 * outright, see docs/adr/0031's hotfix).
 */
export function browseQueueName(workerId: string): string {
  return `browse-fs-${workerId}`;
}

export function createDirectoryBrowseBullQueue(
  connection: ConnectionOptions,
  workerId: string,
): Queue<BrowseDirectoryRequest, BrowseDirectoryResult> {
  return new Queue(browseQueueName(workerId), { connection });
}

export function createDirectoryBrowseBullWorker(
  connection: ConnectionOptions,
  processor: Processor<BrowseDirectoryRequest, BrowseDirectoryResult>,
  workerId: string,
): Worker<BrowseDirectoryRequest, BrowseDirectoryResult> {
  return new Worker(browseQueueName(workerId), processor, { connection });
}

/** How long the API waits for a worker to actually answer before giving up (see docs/adr/0032) — a folder picker is interactive, so this has to fail fast, not hang. */
const BROWSE_TIMEOUT_MS = 10_000;

/**
 * Unlike ScanQueue/UnitTestQueue/CoverageQueue (fire-and-forget — the
 * result lands in Postgres, not the caller's hand), a folder picker needs
 * the real listing back before it's useful at all. BullMQ's own
 * `QueueEvents` + `Job#waitUntilFinished` do exactly this — first use of
 * `QueueEvents` in this codebase, since every other queue here never
 * needed to wait on its own job.
 */
export class BullMqDirectoryBrowseQueue implements DirectoryBrowseQueue {
  private readonly queue: Queue<BrowseDirectoryRequest, BrowseDirectoryResult>;
  private readonly queueEvents: QueueEvents;

  constructor(connection: ConnectionOptions, workerId: string) {
    const name = browseQueueName(workerId);
    this.queue = new Queue(name, { connection });
    this.queueEvents = new QueueEvents(name, { connection });
  }

  async browse(request: BrowseDirectoryRequest): Promise<BrowseDirectoryResult> {
    const job = await this.queue.add('browse', request, {
      removeOnComplete: true,
      removeOnFail: true,
    });
    try {
      return await job.waitUntilFinished(this.queueEvents, BROWSE_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw new Error(
          `No worker responded within ${BROWSE_TIMEOUT_MS}ms — is a worker actually running for this workerId?`,
        );
      }
      throw error;
    }
  }
}

/** Mirrors BullMqScanQueueRegistry (docs/adr/0031) — one real (queue, QueueEvents) pair per workerId, lazily created and cached. */
export class BullMqDirectoryBrowseQueueRegistry implements DirectoryBrowseQueueRegistry {
  private readonly queues = new Map<string, DirectoryBrowseQueue>();

  constructor(private readonly connection: ConnectionOptions) {}

  forWorker(workerId: string): DirectoryBrowseQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new BullMqDirectoryBrowseQueue(this.connection, workerId);
    this.queues.set(workerId, queue);
    return queue;
  }
}
