import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BrowseDirectoryResult, DirectoryBrowseQueueRegistry } from '@cqp/core';
import { browseDirectory } from '@cqp/filesystem-browser';
import { DIRECTORY_BROWSE_QUEUE_REGISTRY } from '../tokens.js';

// Re-exported for any existing import of these — the real types now live in @cqp/core (docs/adr/0032).
export type { BrowseDirectoryResult, DirectoryEntry } from '@cqp/core';

/**
 * Lets the browser pick a scan/test target without the user hand-typing an
 * absolute path (see docs/adr/0023, docs/adr/0024). Originally always read
 * this process's own filesystem, on the assumption the API and the repo's
 * worker were the same machine (ADR-0003/ADR-0021) — no longer true once a
 * repo's `workerId` can point at a different machine entirely (docs/adr/0031).
 *
 * `?workerId=` routes the request to that specific worker instead, over the
 * real BullMQ request/response round trip in `@cqp/queue`'s
 * `DirectoryBrowseQueueRegistry` (docs/adr/0032) — the worker actually reads
 * its own disk and sends the listing back. Omitting `workerId` keeps the
 * original direct-read behavior for any caller that doesn't care about
 * routing (e.g. a genuinely single-machine deployment).
 *
 * Read-only; directories only by default, `?includeFiles=true` also lists
 * files (needed to pick a single-file unit-test target). Behind the same
 * global ApiTokenGuard as every other route (ADR-0022's no-verification-yet
 * caveat already applies to this whole app, not specially to this route).
 */
@ApiBearerAuth()
@ApiTags('fs')
@Controller('fs')
export class FsController {
  constructor(
    @Inject(DIRECTORY_BROWSE_QUEUE_REGISTRY)
    private readonly directoryBrowseQueueRegistry: DirectoryBrowseQueueRegistry,
  ) {}

  @Get('browse')
  async browse(
    @Query('path') path?: string,
    @Query('includeFiles') includeFiles?: string,
    @Query('workerId') workerId?: string,
  ): Promise<BrowseDirectoryResult> {
    const showFiles = includeFiles === 'true';

    try {
      if (workerId !== undefined && workerId.trim().length > 0) {
        return await this.directoryBrowseQueueRegistry.forWorker(workerId).browse({
          ...(path !== undefined ? { path } : {}),
          includeFiles: showFiles,
        });
      }
      return await browseDirectory(path, showFiles);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
