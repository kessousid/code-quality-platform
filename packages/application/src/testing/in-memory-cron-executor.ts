import type { CronDefinition, CronExecutionResult, CronExecutor } from '@cqp/core';

/**
 * Configurable fake, use-case-test-only — unlike a "read the real
 * filesystem" port, faking "call a remote third party" is legitimate here.
 * @cqp/cron-client's own adapter test uses a real HTTP server instead, never this.
 */
export class InMemoryCronExecutor implements CronExecutor {
  result: CronExecutionResult = { statusCode: 200, body: '{}' };
  error: Error | undefined;
  readonly calls: { definition: CronDefinition; baseUrl: string }[] = [];

  async execute(definition: CronDefinition, baseUrl: string): Promise<CronExecutionResult> {
    this.calls.push({ definition, baseUrl });
    if (this.error) {
      throw this.error;
    }
    return this.result;
  }
}
