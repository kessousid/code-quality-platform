import { Redis } from 'ioredis';

/**
 * Every BullMQ producer/consumer in this monorepo (three API modules, one
 * worker) constructed its own `new Redis(...)` inline, none with an
 * `.on('error', ...)` listener attached (docs/adr/0029). ioredis's `Redis`
 * class extends `EventEmitter`, and Node crashes the whole process on an
 * `'error'` event with zero listeners — so a purely transient DNS hiccup
 * resolving the Redis host (observed repeatedly against Upstash's
 * GeoDNS-routed hostname) was taking down the entire API or worker
 * process, not just failing one request. ioredis already retries
 * connection failures internally via its own `retryStrategy` — the crash
 * was never about giving up on reconnecting, only about nothing being
 * there to receive the event ioredis emits while it does.
 */
export function createRedisConnection(redisUrl: string): Redis {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    console.error('[redis] connection error (ioredis will keep retrying):', error.message);
  });
  return connection;
}
