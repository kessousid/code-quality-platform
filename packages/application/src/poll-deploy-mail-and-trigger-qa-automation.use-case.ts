import type { DeployMailPollCursorRepository } from '@cqp/core';
import {
  fetchDeployMailAccessToken,
  listRecentDeployMails,
  type DeployMailAppConfig,
} from './deploy-mail-graph-client.js';

export interface PollDeployMailAndTriggerQaAutomationResult {
  /** True if a matching deploy-notification email was found this poll. Enqueueing the actual
   * production run is the caller's job (see apps/qa-automation/src/main.ts) — this use case stays
   * free of a direct @cqp/queue dependency, same layering every other use case in this package follows. */
  matched: boolean;
}

/**
 * See docs/adr/0058. Run on a fixed hourly schedule (no user-configurable
 * interval, no dashboard toggle — gated purely by whether the DEPLOY_MAIL_*
 * env vars are set at all, mirroring how the optional OneDrive feature is
 * gated). A `null` cursor (never polled before) falls back to a 2-hour
 * lookback window, wide enough to cover one missed poll cycle without
 * scanning the mailbox's entire history on first run.
 *
 * Only ever reports the FIRST match in a poll window, not every match —
 * one deploy notification should cause one QA run, not one per email if
 * several happened to land in the same hour.
 *
 * Errors from the Graph calls are intentionally left to propagate (not
 * swallowed) so a broken mail trigger surfaces via the worker's own
 * `.on('failed', ...)` logging — unlike OneDriveReportUploader's
 * best-effort swallow-everything approach, a silently-broken trigger here
 * would just look like "deploys stopped happening," which is far worse
 * than a visible failed job.
 */
export class PollDeployMailAndTriggerQaAutomationUseCase {
  constructor(
    private readonly cursorRepository: DeployMailPollCursorRepository,
    private readonly graphConfig: DeployMailAppConfig,
    private readonly mailbox: string,
    private readonly bodyMatch: string,
  ) {}

  async execute(orgId: string): Promise<PollDeployMailAndTriggerQaAutomationResult> {
    const cursor = await this.cursorRepository.get(orgId);
    const now = new Date();
    const since = cursor.lastPolledAt ?? new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const accessToken = await fetchDeployMailAccessToken(this.graphConfig);
    const messages = await listRecentDeployMails(accessToken, this.mailbox, since.toISOString());

    const needle = this.bodyMatch.toLowerCase();
    const matched = messages.some((message) => message.bodyText.toLowerCase().includes(needle));

    // Always advance the cursor, matched or not -- an email that didn't
    // match is still "seen" and must never be re-evaluated on the next poll.
    await this.cursorRepository.updateLastPolledAt(orgId, now);

    return { matched };
  }
}
