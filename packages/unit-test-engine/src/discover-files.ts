import { readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.turbo',
  '.next',
  // Where this engine writes its own output (docs/adr/0038) — walking
  // into it would be wasted work at best, and at worst burn through
  // MAX_DISCOVERED_FILES on a repo's own accumulated generated tests
  // before ever reaching real source files elsewhere in a root-level scan.
  'Unit tests',
]);

/** A cap, not a suggestion (see docs/adr/0023's C:\CuratalIT lesson) — an LLM call per file means an unbounded folder is an unbounded bill, not just an unbounded scan. */
export const MAX_DISCOVERED_FILES = 15;

export class TargetNotFoundError extends Error {
  constructor(path: string) {
    super(`Target path not found: ${path}`);
    this.name = 'TargetNotFoundError';
  }
}

export interface DiscoveredFile {
  absolutePath: string;
  /** Relative to repoRoot, forward-slash normalized regardless of OS. */
  relativePath: string;
}

/** Also used by @cqp/coverage-engine to exclude test files themselves from "changed source line" accounting. */
export function isTestFilePath(fileName: string): boolean {
  return /\.(generated\.test|test|spec)\.[jt]sx?$/.test(fileName);
}

function toRelative(repoRoot: string, absolutePath: string): string {
  return absolutePath
    .slice(repoRoot.length)
    .replace(/^[/\\]/, '')
    .replace(/\\/g, '/');
}

/**
 * `targetPath` may be a single file or a directory (docs/adr/0024). A
 * directory is walked depth-first in sorted order, skipping
 * node_modules/dist/etc. and any file that already looks like a test
 * file (never generate a test for a test). Stops at `MAX_DISCOVERED_FILES`.
 */
export async function discoverSourceFiles(
  repoRoot: string,
  targetPath: string,
): Promise<DiscoveredFile[]> {
  // `targetPath` must be relative to `repoRoot` by contract (docs/adr/0024).
  // `join()` doesn't special-case an absolute second argument — it just
  // concatenates, silently producing a nonsensical path like
  // "C:\repo\C:\repo\src" that then fails with a confusing generic
  // "not found" below. A caller sending an absolute path here is always a
  // bug upstream (e.g. a client-side prefix-strip that silently fell
  // through) — fail with a message that says so, instead of masking it.
  if (isAbsolute(targetPath)) {
    throw new TargetNotFoundError(
      `${targetPath} (expected a path relative to the repo root, got an absolute path)`,
    );
  }
  const absoluteTarget = join(repoRoot, targetPath);
  let stats;
  try {
    stats = await stat(absoluteTarget);
  } catch {
    throw new TargetNotFoundError(targetPath);
  }

  if (stats.isFile()) {
    return [{ absolutePath: absoluteTarget, relativePath: toRelative(repoRoot, absoluteTarget) }];
  }

  const found: DiscoveredFile[] = [];

  async function walk(dir: string): Promise<void> {
    if (found.length >= MAX_DISCOVERED_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true });
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sorted) {
      if (found.length >= MAX_DISCOVERED_FILES) return;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
        if (isTestFilePath(entry.name)) continue;
        const absolutePath = join(dir, entry.name);
        found.push({ absolutePath, relativePath: toRelative(repoRoot, absolutePath) });
      }
    }
  }

  await walk(absoluteTarget);
  return found;
}
