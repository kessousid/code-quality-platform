import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  BullMqCoverageQueue,
  BullMqCoverageQueueRegistry,
  coverageQueueName,
  createCoverageBullQueue,
} from './coverage-queue.js';

/** Mirrors scan-queue.spec.ts (docs/adr/0031) — same real-BullMQ-object reasoning. */
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

describe('coverageQueueName', () => {
  it('produces a name BullMQ actually accepts for a variety of real workerId shapes', () => {
    for (const workerId of ['default', 'keshav-laptop', 'worker_2', 'machine123']) {
      expect(() => createCoverageBullQueue(unreachableConnection(), workerId)).not.toThrow();
    }
  });

  it('never contains a colon — BullMQ rejects queue names with one', () => {
    expect(coverageQueueName('default')).not.toContain(':');
  });
});

describe('BullMqCoverageQueueRegistry', () => {
  it('gives two different workerIds two distinct queue instances', () => {
    const registry = new BullMqCoverageQueueRegistry(unreachableConnection());

    const laptopQueue = registry.forWorker('keshav-laptop');
    const defaultQueue = registry.forWorker('default');

    expect(laptopQueue).not.toBe(defaultQueue);
    expect(laptopQueue).toBeInstanceOf(BullMqCoverageQueue);
  });

  it('returns the same cached instance for the same workerId', () => {
    const registry = new BullMqCoverageQueueRegistry(unreachableConnection());

    expect(registry.forWorker('keshav-laptop')).toBe(registry.forWorker('keshav-laptop'));
  });
});
