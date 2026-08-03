import { describe, expect, it } from 'vitest';
import { GetQaAutomationStagingScheduleUseCase } from './get-qa-automation-staging-schedule.use-case.js';
import { UpdateQaAutomationStagingScheduleUseCase } from './update-qa-automation-staging-schedule.use-case.js';
import { InMemoryQaAutomationStagingScheduleRepository } from './testing/in-memory-qa-automation-staging-schedule-repository.js';

const ORG_ID = 'org_1';

describe('QaAutomationStagingSchedule use cases', () => {
  it('defaults to enabled on first read, with no interval field', async () => {
    const repository = new InMemoryQaAutomationStagingScheduleRepository();
    const getUseCase = new GetQaAutomationStagingScheduleUseCase(repository);

    const schedule = await getUseCase.execute(ORG_ID);

    expect(schedule).toEqual({ enabled: true });
  });

  it('disables and re-enables the schedule through the update use case', async () => {
    const repository = new InMemoryQaAutomationStagingScheduleRepository();
    const getUseCase = new GetQaAutomationStagingScheduleUseCase(repository);
    const updateUseCase = new UpdateQaAutomationStagingScheduleUseCase(repository);

    const disabled = await updateUseCase.execute(ORG_ID, { enabled: false });
    expect(disabled.enabled).toBe(false);
    expect(await getUseCase.execute(ORG_ID)).toEqual({ enabled: false });

    const reenabled = await updateUseCase.execute(ORG_ID, { enabled: true });
    expect(reenabled.enabled).toBe(true);
  });
});
