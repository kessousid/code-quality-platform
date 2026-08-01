import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { createQaAutomationBullQueue, qaAutomationSchedulerId } from './qa-automation-queue.js';

/** Same rationale as scan-queue.spec.ts — a real Queue constructed against an unreachable connection still validates the name synchronously. */
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

describe('qaAutomationSchedulerId', () => {
  it('is stable and org-scoped, never containing a colon', () => {
    expect(qaAutomationSchedulerId('org_1')).toBe(qaAutomationSchedulerId('org_1'));
    expect(qaAutomationSchedulerId('org_1')).not.toBe(qaAutomationSchedulerId('org_2'));
    expect(qaAutomationSchedulerId('org_1')).not.toContain(':');
  });
});

describe('createQaAutomationBullQueue', () => {
  it('constructs without throwing', () => {
    expect(() => createQaAutomationBullQueue(unreachableConnection())).not.toThrow();
  });
});
