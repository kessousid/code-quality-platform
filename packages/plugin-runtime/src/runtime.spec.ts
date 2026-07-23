import { describe, expect, it } from 'vitest';
import { runIsolated } from './runtime.js';

/**
 * No mocking here on purpose — worker_threads has no honest fake to
 * substitute (see docs/adr/0011). Every case below spawns a real worker
 * thread running a real fixture module.
 *
 * modulePath must stay a file:// URL string, not a raw OS path — Node's
 * ESM loader rejects a plain Windows path like "C:\..." passed to import().
 */
function fixtureUrl(name: string): string {
  return new URL(`./__fixtures__/${name}`, import.meta.url).href;
}

describe('runIsolated', () => {
  it('returns the result of a successful plugin', async () => {
    const result = await runIsolated<{ value: number }, unknown>(
      { modulePath: fixtureUrl('success.mjs') },
      { value: 42 },
      { timeoutMs: 5000 },
    );

    expect(result).toEqual({ status: 'success', result: { echoed: { value: 42 } } });
  });

  it('captures a thrown error without crashing the caller', async () => {
    const result = await runIsolated(fixtureTarget('throwing.mjs'), null, { timeoutMs: 5000 });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('deliberate failure');
    }
  });

  it('times out a hanging plugin instead of waiting forever', async () => {
    const result = await runIsolated(fixtureTarget('hanging.mjs'), null, { timeoutMs: 200 });

    expect(result).toEqual({ status: 'timeout' });
  }, 10000);

  it('aborts a hanging plugin immediately when the signal fires, without waiting for the timeout', async () => {
    const controller = new AbortController();
    const start = Date.now();
    const resultPromise = runIsolated(fixtureTarget('hanging.mjs'), null, {
      timeoutMs: 10_000,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 100);
    const result = await resultPromise;

    expect(result.status).toBe('error');
    expect(Date.now() - start).toBeLessThan(5000);
  }, 10000);

  function fixtureTarget(name: string) {
    return { modulePath: fixtureUrl(name) };
  }
});
