import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { ObjectStorage } from '@cqp/core';

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Dev/single-instance adapter for the `ObjectStorage` port (see
 * docs/adr/0019). Not safe for a multi-instance `apps/api` deployment —
 * same caveat ADR-0006 already accepts for the worker. Swap for an
 * S3/GCS adapter behind the same port when that matters.
 */
export class LocalFilesystemObjectStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  async put(key: string, content: Buffer | string): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async get(key: string): Promise<Buffer> {
    const path = this.resolveKey(key);
    try {
      return await readFile(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new ObjectNotFoundError(key);
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.get(key);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /** Confines every key to `root` — rejects `..`-escapes and absolute keys. */
  private resolveKey(key: string): string {
    if (isAbsolute(key)) {
      throw new Error(`Object key must be relative: ${key}`);
    }
    const resolvedRoot = resolve(this.root);
    const path = resolve(resolvedRoot, key);
    const rel = relative(resolvedRoot, path);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Object key escapes storage root: ${key}`);
    }
    return path;
  }
}
