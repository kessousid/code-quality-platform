import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browseDirectory } from './browse-directory.js';

/** Real filesystem, no mocking (project convention) — a throwaway temp dir stands in for "some repo checkout root". */
describe('browseDirectory', () => {
  it('lists real subdirectories of a given path, sorted, directories only, by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
    try {
      await mkdir(join(root, 'zeta'));
      await mkdir(join(root, 'alpha'));
      await writeFile(join(root, 'not-a-dir.txt'), 'x');

      const result = await browseDirectory(root, false);

      expect(result.entries.map((e) => e.name)).toEqual(['alpha', 'zeta']);
      expect(result.entries.every((e) => e.type === 'directory')).toBe(true);
      expect(result.parent).not.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('also lists files, directories first, when includeFiles is true', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
    try {
      await mkdir(join(root, 'zeta'));
      await writeFile(join(root, 'a-file.ts'), 'x');

      const result = await browseDirectory(root, true);

      expect(result.entries.map((e) => ({ name: e.name, type: e.type }))).toEqual([
        { name: 'zeta', type: 'directory' },
        { name: 'a-file.ts', type: 'file' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a path that does not exist', async () => {
    await expect(
      browseDirectory(join(tmpdir(), 'cqp-does-not-exist-xyz'), false),
    ).rejects.toThrow();
  });

  it('falls back to the home directory when no path is given', async () => {
    const result = await browseDirectory(undefined, false);
    expect(result.path.length).toBeGreaterThan(0);
  });
});
