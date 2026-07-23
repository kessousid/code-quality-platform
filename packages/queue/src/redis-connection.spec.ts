import { afterEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { createRedisConnection } from './redis-connection.js';

describe('createRedisConnection', () => {
  let connection: Redis | undefined;

  afterEach(() => {
    connection?.disconnect();
  });

  it('attaches a real error listener, so a real connection failure does not crash the process', async () => {
    // Port 1 refuses immediately on any machine — a real, fast connection failure, not a mock.
    connection = createRedisConnection('redis://127.0.0.1:1');
    expect(connection.listenerCount('error')).toBeGreaterThan(0);

    // If nothing were listening for 'error', ioredis (as an EventEmitter) would throw here uncaught,
    // which vitest would surface as a test failure — reaching this line at all is the real assertion.
    await new Promise<void>((resolve) => connection!.once('error', () => resolve()));
  });
});
