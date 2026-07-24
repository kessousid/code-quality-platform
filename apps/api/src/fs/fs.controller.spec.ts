import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryDirectoryBrowseQueueRegistry } from '@cqp/application/testing';
import { FsController } from './fs.controller.js';

/** Real filesystem, no mocking (project convention) — a throwaway temp dir stands in for "some repo checkout root". */
describe('FsController', () => {
  it('lists real subdirectories of a given path, sorted, directories only, by default', async () => {
    const controller = new FsController(new InMemoryDirectoryBrowseQueueRegistry());
    const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
    try {
      await mkdir(join(root, 'zeta'));
      await mkdir(join(root, 'alpha'));
      await writeFile(join(root, 'not-a-dir.txt'), 'x');

      const result = await controller.browse(root);

      expect(result.entries.map((e) => e.name)).toEqual(['alpha', 'zeta']);
      expect(result.entries.every((e) => e.type === 'directory')).toBe(true);
      expect(result.parent).not.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('also lists files, directories first, when includeFiles=true', async () => {
    const controller = new FsController(new InMemoryDirectoryBrowseQueueRegistry());
    const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
    try {
      await mkdir(join(root, 'zeta'));
      await writeFile(join(root, 'a-file.ts'), 'x');

      const result = await controller.browse(root, 'true');

      expect(result.entries.map((e) => ({ name: e.name, type: e.type }))).toEqual([
        { name: 'zeta', type: 'directory' },
        { name: 'a-file.ts', type: 'file' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a path that does not exist', async () => {
    const controller = new FsController(new InMemoryDirectoryBrowseQueueRegistry());
    await expect(controller.browse(join(tmpdir(), 'cqp-does-not-exist-xyz'))).rejects.toThrow();
  });

  describe('routing via workerId (docs/adr/0032)', () => {
    it("routes through the registry instead of reading this process's own filesystem when workerId is given", async () => {
      const registry = new InMemoryDirectoryBrowseQueueRegistry();
      const controller = new FsController(registry);
      const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
      try {
        await mkdir(join(root, 'src'));

        const result = await controller.browse(root, undefined, 'keshav-laptop');

        expect(result.entries.map((e) => e.name)).toEqual(['src']);
        expect(registry.forWorker('keshav-laptop').requests).toEqual([
          { path: root, includeFiles: false },
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("never touches a different workerId's queue", async () => {
      const registry = new InMemoryDirectoryBrowseQueueRegistry();
      const controller = new FsController(registry);
      const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
      try {
        await controller.browse(root, undefined, 'keshav-laptop');

        expect(registry.forWorker('default').requests).toHaveLength(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it('surfaces a clear error when no worker responds', async () => {
      const registry = new InMemoryDirectoryBrowseQueueRegistry();
      registry.forWorker('offline-laptop').unreachable = true;
      const controller = new FsController(registry);

      await expect(controller.browse(undefined, undefined, 'offline-laptop')).rejects.toThrow(
        /No worker responded/,
      );
    });

    it('ignores a blank workerId and falls back to the direct-read path', async () => {
      const controller = new FsController(new InMemoryDirectoryBrowseQueueRegistry());
      const root = await mkdtemp(join(tmpdir(), 'cqp-fs-browse-'));
      try {
        const result = await controller.browse(root, undefined, '   ');
        expect(result.path).toBe(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
