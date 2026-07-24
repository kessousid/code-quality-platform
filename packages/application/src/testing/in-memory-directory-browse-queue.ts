import type {
  BrowseDirectoryRequest,
  BrowseDirectoryResult,
  DirectoryBrowseQueue,
  DirectoryBrowseQueueRegistry,
} from '@cqp/core';
import { browseDirectory } from '@cqp/filesystem-browser';

/**
 * Unlike the other in-memory queues (pure stand-ins with nothing to fake —
 * enqueue/cancel just record what happened), a request/response browse
 * port's whole job IS reading the real filesystem, so it calls the real
 * `browseDirectory` rather than returning a canned result that would test
 * nothing meaningful. Records every request for assertion purposes, and
 * `unreachable` lets a test simulate "no worker is running for this
 * workerId" without needing a real timeout.
 */
export class InMemoryDirectoryBrowseQueue implements DirectoryBrowseQueue {
  readonly requests: BrowseDirectoryRequest[] = [];
  unreachable = false;

  async browse(request: BrowseDirectoryRequest): Promise<BrowseDirectoryResult> {
    this.requests.push(request);
    if (this.unreachable) {
      throw new Error(
        'No worker responded within 10000ms — is a worker actually running for this workerId?',
      );
    }
    return browseDirectory(request.path, request.includeFiles ?? false);
  }
}

/** Mirrors InMemoryScanQueueRegistry (docs/adr/0031, docs/adr/0032) — a distinct queue per workerId. */
export class InMemoryDirectoryBrowseQueueRegistry implements DirectoryBrowseQueueRegistry {
  private readonly queues = new Map<string, InMemoryDirectoryBrowseQueue>();

  forWorker(workerId: string): InMemoryDirectoryBrowseQueue {
    const existing = this.queues.get(workerId);
    if (existing) return existing;

    const queue = new InMemoryDirectoryBrowseQueue();
    this.queues.set(workerId, queue);
    return queue;
  }
}
