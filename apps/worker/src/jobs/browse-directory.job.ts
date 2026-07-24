import type { BrowseDirectoryRequest, BrowseDirectoryResult } from '@cqp/core';
import { browseDirectory } from '@cqp/filesystem-browser';

/**
 * Mirrors healthcheck.job.ts's split (pure function, separate from the
 * BullMQ `Worker` binding in queue.ts) — see docs/adr/0032. Reuses the
 * exact same `browseDirectory` `apps/api`'s legacy no-workerId path calls
 * directly, so both never drift into two different directory-listing
 * behaviors.
 */
export function processBrowseDirectoryJob(
  data: BrowseDirectoryRequest,
): Promise<BrowseDirectoryResult> {
  return browseDirectory(data.path, data.includeFiles ?? false);
}
