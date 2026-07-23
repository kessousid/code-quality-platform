import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface BrowseDirectoryResult {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

/**
 * Lets the browser pick a scan/test target without the user hand-typing
 * an absolute path (see docs/adr/0023, docs/adr/0024) — the worker runs on
 * this same machine in the current deployment model (ADR-0003), so
 * "browse the server's filesystem" and "browse the user's own machine"
 * are the same thing here. Read-only; directories only by default,
 * `?includeFiles=true` also lists files (needed to pick a single-file
 * unit-test target). Behind the same global ApiTokenGuard as every other
 * route (ADR-0022's no-verification-yet caveat already applies to this
 * whole app, not specially to this route).
 */
@ApiBearerAuth()
@ApiTags('fs')
@Controller('fs')
export class FsController {
  @Get('browse')
  async browse(
    @Query('path') path?: string,
    @Query('includeFiles') includeFiles?: string,
  ): Promise<BrowseDirectoryResult> {
    const target = resolve(path && path.trim().length > 0 ? path : homedir());

    let dirents;
    try {
      dirents = await readdir(target, { withFileTypes: true });
    } catch (error) {
      throw new BadRequestException(
        `Cannot read directory "${target}": ${(error as Error).message}`,
      );
    }

    const showFiles = includeFiles === 'true';
    const entries = dirents
      .filter((entry) => entry.isDirectory() || (showFiles && entry.isFile()))
      .map((entry) => ({
        name: entry.name,
        path: resolve(target, entry.name),
        type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
      }))
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1,
      );

    const parent = dirname(target);
    return { path: target, parent: parent === target ? null : parent, entries };
  }
}
