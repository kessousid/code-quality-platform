import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { BrowseDirectoryResult } from '@cqp/core';

/**
 * The actual directory-listing logic behind `GET /fs/browse` — extracted so
 * both `apps/api` (the legacy no-workerId direct-read path) and
 * `apps/worker` (processing a routed browse job, see docs/adr/0032) run the
 * exact same code, not two copies that could drift. Framework-free: throws
 * a plain `Error`, not a NestJS `BadRequestException` — each caller
 * translates it into whatever error shape fits its own transport.
 */
export async function browseDirectory(
  path: string | undefined,
  includeFiles: boolean,
): Promise<BrowseDirectoryResult> {
  const target = resolve(path && path.trim().length > 0 ? path : homedir());

  let dirents;
  try {
    dirents = await readdir(target, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read directory "${target}": ${(error as Error).message}`);
  }

  const entries = dirents
    .filter((entry) => entry.isDirectory() || (includeFiles && entry.isFile()))
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
