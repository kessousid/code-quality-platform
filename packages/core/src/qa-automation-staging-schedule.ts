/**
 * Staging's own schedule row (see docs/adr/0036) — distinct from
 * QaAutomationSchedule (production). No interval field: the cron pattern
 * itself ("once daily at midnight IST") is a fixed constant in code, not
 * user-configurable — the only thing the user actually asked to control
 * here is whether the daily run is enabled at all.
 */
export interface QaAutomationStagingSchedule {
  enabled: boolean;
}

export interface UpdateQaAutomationStagingScheduleInput {
  enabled?: boolean;
}

export interface QaAutomationStagingScheduleRepository {
  /** Creates the single default row (enabled: true) on first read if none exists yet. */
  get(orgId: string): Promise<QaAutomationStagingSchedule>;
  update(
    orgId: string,
    input: UpdateQaAutomationStagingScheduleInput,
  ): Promise<QaAutomationStagingSchedule>;
}
