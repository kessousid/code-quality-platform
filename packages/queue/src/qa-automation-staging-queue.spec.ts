import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  createQaAutomationStagingBullQueue,
  qaAutomationStagingSchedulerId,
} from './qa-automation-staging-queue.js';

/** Same rationale as qa-automation-queue.spec.ts — a real Queue constructed against an unreachable connection still validates the name synchronously. */
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

describe('qaAutomationStagingSchedulerId', () => {
  it('is stable and org-scoped, never containing a colon, and distinct from the production scheduler id', () => {
    expect(qaAutomationStagingSchedulerId('org_1')).toBe(qaAutomationStagingSchedulerId('org_1'));
    expect(qaAutomationStagingSchedulerId('org_1')).not.toBe(
      qaAutomationStagingSchedulerId('org_2'),
    );
    expect(qaAutomationStagingSchedulerId('org_1')).not.toContain(':');
    expect(qaAutomationStagingSchedulerId('org_1')).not.toBe('qa-automation-org_1');
  });
});

describe('createQaAutomationStagingBullQueue', () => {
  it('constructs without throwing', () => {
    expect(() => createQaAutomationStagingBullQueue(unreachableConnection())).not.toThrow();
  });
});
