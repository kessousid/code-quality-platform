import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  BullMqScanQueue,
  BullMqScanQueueRegistry,
  createScanBullQueue,
  scanQueueName,
} from './scan-queue.js';

/**
 * Real BullMQ objects, not the in-memory test double — this package had
 * zero test coverage before docs/adr/0031, and the gap showed: BullMQ
 * rejects `:` in queue names outright (it's BullMQ's own Redis key
 * delimiter), which the in-memory fakes can't catch since they're just
 * plain JS objects with no name validation. That only surfaced once this
 * ran against real BullMQ in production. Constructing a real `Queue`
 * validates the name synchronously, before any network I/O, so this
 * needs no live Redis to catch a repeat of that class of bug — the
 * connection just has to be a real `Redis` instance, not reachable.
 */
const connections: Redis[] = [];

/** Port 1 refuses immediately on any machine — real enough to exercise BullMQ's own name validation without ever needing a live Redis. */
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

describe('scanQueueName', () => {
  it('produces a name BullMQ actually accepts for a variety of real workerId shapes', () => {
    for (const workerId of ['default', 'keshav-laptop', 'worker_2', 'machine123']) {
      expect(() =>
        createScanBullQueue(unreachableConnection(), scanQueueName(workerId)),
      ).not.toThrow();
    }
  });

  it('never contains a colon — BullMQ rejects queue names with one', () => {
    expect(scanQueueName('default')).not.toContain(':');
    expect(scanQueueName('keshav-laptop')).not.toContain(':');
  });
});

describe('BullMqScanQueueRegistry', () => {
  it('gives two different workerIds two distinct queue instances', () => {
    const registry = new BullMqScanQueueRegistry(unreachableConnection());

    const laptopQueue = registry.forWorker('keshav-laptop');
    const defaultQueue = registry.forWorker('default');

    expect(laptopQueue).not.toBe(defaultQueue);
    expect(laptopQueue).toBeInstanceOf(BullMqScanQueue);
  });

  it('returns the same cached instance for the same workerId', () => {
    const registry = new BullMqScanQueueRegistry(unreachableConnection());

    expect(registry.forWorker('keshav-laptop')).toBe(registry.forWorker('keshav-laptop'));
  });
});
