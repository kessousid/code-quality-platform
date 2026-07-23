import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalFilesystemObjectStorage,
  ObjectNotFoundError,
} from './local-filesystem-object-storage.js';

/**
 * Real filesystem I/O throughout — a throwaway temp directory per test,
 * cleaned up in `afterEach`. No mocking of `fs`, consistent with this
 * project's testing conventions elsewhere (Phase 7's plugin adapters).
 */
let root: string;
let storage: LocalFilesystemObjectStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cqp-storage-test-'));
  storage = new LocalFilesystemObjectStorage(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalFilesystemObjectStorage', () => {
  it('round-trips a Buffer through put/get, creating nested directories as needed', async () => {
    const content = Buffer.from('hello world', 'utf-8');
    await storage.put('reports/org_1/scan_1/report.json', content);

    const result = await storage.get('reports/org_1/scan_1/report.json');
    expect(result.equals(content)).toBe(true);
  });

  it('round-trips a string, stored and read back as UTF-8 bytes', async () => {
    await storage.put('a.txt', 'plain text content');
    const result = await storage.get('a.txt');
    expect(result.toString('utf-8')).toBe('plain text content');
  });

  it('overwrites an existing key on a second put', async () => {
    await storage.put('a.txt', 'first');
    await storage.put('a.txt', 'second');
    expect((await storage.get('a.txt')).toString('utf-8')).toBe('second');
  });

  it('throws ObjectNotFoundError for a key that was never written', async () => {
    await expect(storage.get('does/not/exist.json')).rejects.toThrow(ObjectNotFoundError);
  });

  it('exists() reflects real presence without throwing', async () => {
    expect(await storage.exists('x.txt')).toBe(false);
    await storage.put('x.txt', 'y');
    expect(await storage.exists('x.txt')).toBe(true);
  });

  it('rejects an absolute key', async () => {
    await expect(storage.put('/etc/passwd', 'x')).rejects.toThrow(/must be relative/);
  });

  it('rejects a key that escapes the storage root via ..', async () => {
    await expect(storage.put('../../etc/passwd', 'x')).rejects.toThrow(/escapes storage root/);
  });
});
