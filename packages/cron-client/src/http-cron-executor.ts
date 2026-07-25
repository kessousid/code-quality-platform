import type { CronDefinition, CronExecutionResult, CronExecutor } from '@cqp/core';

/**
 * The first backend caller of an external HTTP API in this codebase (see
 * docs/adr/0033) — global fetch (Node 20+), no new dependency. Never
 * throws on a non-2xx HTTP response (that's still data to report); throws
 * only on a genuine failure to complete the exchange at all.
 */
export class HttpCronExecutor implements CronExecutor {
  async execute(definition: CronDefinition, baseUrl: string): Promise<CronExecutionResult> {
    const url = `${baseUrl}${definition.path}`;
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST' });
    } catch (error) {
      throw new Error(`Failed to reach ${url}: ${(error as Error).message}`);
    }
    const body = await response.text();
    return { statusCode: response.status, body };
  }
}
