import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CronDefinition } from '@cqp/core';
import { HttpCronExecutor } from './http-cron-executor.js';

/** Real HTTP server as the test double (project convention: no mocking) — a fake in-process endpoint stands in for the external recruiting platform. */
describe('HttpCronExecutor', () => {
  let server: Server;
  let baseUrl: string;
  let lastRequestPath: string | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      lastRequestPath = req.url;
      if (req.url === '/fails') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 200, message: 'ok' }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns the real status code and body for a successful response', async () => {
    const executor = new HttpCronExecutor();
    const definition: CronDefinition = { id: 'x', name: 'x', path: '/ok' };

    const result = await executor.execute(definition, baseUrl);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 200, message: 'ok' });
    expect(lastRequestPath).toBe('/ok');
  });

  it('still resolves (does not throw) on a non-2xx response', async () => {
    const executor = new HttpCronExecutor();
    const definition: CronDefinition = { id: 'x', name: 'x', path: '/fails' };

    const result = await executor.execute(definition, baseUrl);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'boom' });
  });

  it('throws a clear error when the target cannot be reached at all', async () => {
    const executor = new HttpCronExecutor();
    const definition: CronDefinition = { id: 'x', name: 'x', path: '/ok' };

    await expect(executor.execute(definition, 'http://127.0.0.1:1')).rejects.toThrow(
      /Failed to reach/,
    );
  });
});
