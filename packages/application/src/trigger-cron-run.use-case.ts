import {
  CRON_DEFINITIONS,
  CRON_ENVIRONMENT_BASE_URLS,
  type CompleteCronRunInput,
  type CronEnvironment,
  type CronExecutor,
  type CronRun,
  type CronRunRepository,
} from '@cqp/core';

export class CronNotFoundError extends Error {
  constructor(cronId: string) {
    super(`Cron not found: ${cronId}`);
    this.name = 'CronNotFoundError';
  }
}

export interface TriggerCronRunInput {
  orgId: string;
  cronId: string;
  environment: CronEnvironment;
  triggeredByUserId?: string;
}

/**
 * Application layer (docs/adr/0010): depends only on domain ports. See
 * docs/adr/0033 for why this call is synchronous/blocking rather than
 * queued — the external endpoint itself runs synchronously, so the
 * caller's own pending-request state is the "live status."
 */
export class TriggerCronRunUseCase {
  constructor(
    private readonly cronRunRepository: CronRunRepository,
    private readonly cronExecutor: CronExecutor,
  ) {}

  async execute(input: TriggerCronRunInput): Promise<CronRun> {
    const definition = CRON_DEFINITIONS.find((d) => d.id === input.cronId);
    if (!definition) {
      throw new CronNotFoundError(input.cronId);
    }

    const run = await this.cronRunRepository.create({
      orgId: input.orgId,
      cronId: definition.id,
      cronName: definition.name,
      environment: input.environment,
      ...(input.triggeredByUserId !== undefined
        ? { triggeredByUserId: input.triggeredByUserId }
        : {}),
    });

    const baseUrl = CRON_ENVIRONMENT_BASE_URLS[input.environment];
    let outcome: CompleteCronRunInput;
    try {
      const result = await this.cronExecutor.execute(definition, baseUrl);
      outcome = {
        status: result.statusCode < 400 ? 'succeeded' : 'failed',
        statusCode: result.statusCode,
        responseBody: result.body,
      };
    } catch (error) {
      outcome = { status: 'failed', errorMessage: (error as Error).message };
    }

    return this.cronRunRepository.complete(input.orgId, run.id, outcome);
  }
}
