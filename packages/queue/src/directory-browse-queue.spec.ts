import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  browseQueueName,
  BullMqDirectoryBrowseQueue,
  BullMqDirectoryBrowseQueueRegistry,
  createDirectoryBrowseBullQueue,
} from './directory-browse-queue.js';

/**
 * Mirrors scan-queue.spec.ts (docs/adr/0031, docs/adr/0032) — real BullMQ
 * objects, not a mock, but no live Redis needed for these: constructing a
 * `Queue`/`QueueEvents` validates the name synchronously, before any
 * network I/O. The actual request/response round trip (the genuinely new
 * part — this is the first use of `QueueEvents` in this codebase) was
 * verified live against a real deployment instead, the same way
 * docs/adr/0031's routing itself was.
 */
const connections: Redis[] = [];

function unreachableConnection(): Redis {
  const connection = new Redis('redis://127.0.0.1:1', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  connections.push(connection);
  return connection;
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.disconnect();
});

describe('browseQueueName', () => {
  it('produces a name BullMQ actually accepts for a variety of real workerId shapes', () => {
    for (const workerId of ['default', 'keshav-laptop', 'worker_2', 'machine123']) {
      expect(() => createDirectoryBrowseBullQueue(unreachableConnection(), workerId)).not.toThrow();
    }
  });

  it('never contains a colon — BullMQ rejects queue names with one', () => {
    expect(browseQueueName('default')).not.toContain(':');
    expect(browseQueueName('keshav-laptop')).not.toContain(':');
  });
});

describe('BullMqDirectoryBrowseQueueRegistry', () => {
  it('gives two different workerIds two distinct queue instances', () => {
    const registry = new BullMqDirectoryBrowseQueueRegistry(unreachableConnection());

    const laptopQueue = registry.forWorker('keshav-laptop');
    const defaultQueue = registry.forWorker('default');

    expect(laptopQueue).not.toBe(defaultQueue);
    expect(laptopQueue).toBeInstanceOf(BullMqDirectoryBrowseQueue);
  });

  it('returns the same cached instance for the same workerId', () => {
    const registry = new BullMqDirectoryBrowseQueueRegistry(unreachableConnection());

    expect(registry.forWorker('keshav-laptop')).toBe(registry.forWorker('keshav-laptop'));
  });
});
