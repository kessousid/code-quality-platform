import {
  isSkippedTestResult,
  type EmailSender,
  type QaAutomationRun,
  type QaAutomationRunRepository,
  type QaAutomationTestResultRepository,
  type QaAutomationTrigger,
  type StagingTestResult,
  type StagingTestRunner,
} from '@cqp/core';
import { buildQaAutomationReportModel, getQaAutomationReportGenerator } from '@cqp/reporting';
import {
  formatOneDriveReportFilename,
  type OneDriveReportUploader,
} from './onedrive-report-uploader.js';

export interface RunStagingTestSuiteInput {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
  /** See StagingTestRunner.run's onlyTestNames -- the "rerun failed/skipped tests" feature. */
  onlyTestNames?: string[];
  /**
   * See selectQuarantinedCarryForward -- the quarantined stub rows
   * excluded from `onlyTestNames`, merged into this run's own results
   * as-is (never executed) so a rerun's report still accounts for every
   * one of the original run's non-passed tests, not just the subset
   * actually re-run.
   */
  carryForwardResults?: StagingTestResult[];
}

/**
 * Env-var escape hatch, same pattern as PytestStagingTestRunner's
 * STAGING_SKIP_BATCH_1 — lets email go silent for a run without a code
 * change, useful while re-running the same investigation repeatedly and
 * not wanting a report email every single time. Unset/anything else means
 * email sends as normal.
 */
const SKIP_EMAIL = process.env.STAGING_SKIP_EMAIL === 'true';

/**
 * See docs/adr/0036. Much simpler than RunQaAutomationSuiteUseCase — there's
 * no per-test frequency gating and no per-test browser page, since the
 * whole external pytest suite runs as one opaque subprocess call via
 * `testRunner.run()`. Same create-run -> run -> persist-results -> complete
 * -> alert-on-failure shape, and the same "the run itself can crash before
 * any test result exists" handling. Threads an `onProgress` callback
 * through to the runner (docs/adr/0044) so a run that can legitimately
 * take hours is never indistinguishable from a hung one.
 */
export class RunStagingTestSuiteUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly resultRepository: QaAutomationTestResultRepository,
    private readonly testRunner: StagingTestRunner,
    private readonly emailSender: EmailSender,
    private readonly alertEmailTo: string,
    private readonly alertEmailCc?: string,
    private readonly oneDriveUploader?: OneDriveReportUploader,
  ) {}

  async execute(input: RunStagingTestSuiteInput): Promise<QaAutomationRun> {
    const run = await this.runRepository.create({
      orgId: input.orgId,
      environment: 'staging',
      triggeredBy: input.triggeredBy,
    });

    // Per the user: a "rerun failed/skipped tests" trigger (identified by
    // onlyTestNames being set) is a quick targeted re-check, not a normal
    // full run -- skip the report email for it "for the mean time", same
    // as the STAGING_SKIP_EMAIL escape hatch below but scoped to reruns
    // specifically rather than every run.
    const isRerun = (input.onlyTestNames?.length ?? 0) > 0;
    const skipEmail = SKIP_EMAIL || isRerun;

    try {
      // Fire-and-forget on purpose (docs/adr/0044) — this fires on every
      // percentage tick from a real subprocess's live stdout, and must
      // never make that stream wait on a DB round trip; a failed write
      // here is a lost progress update, not a lost test result.
      const { results: runnerResults } = await this.testRunner.run((percent) => {
        this.runRepository.updateProgress(input.orgId, run.id, percent).catch((error: unknown) => {
          console.error(`[staging run ${run.id}] failed to persist progress:`, error);
        });
      }, input.onlyTestNames);
      // Carried-forward quarantine stubs (rerun only) are appended as-is,
      // never executed -- see RunStagingTestSuiteInput.carryForwardResults.
      const results = [...runnerResults, ...(input.carryForwardResults ?? [])];
      for (const result of results) {
        await this.resultRepository.create({ runId: run.id, ...result });
      }

      // Per the user: the run's own status reflects whether the suite
      // actually executed, not whether every individual test passed —
      // 'failed' is reserved for the run itself never getting the chance
      // to run (the catch block below), not for real per-test failures
      // recorded here. Those are still surfaced via the alert email and
      // the persisted pass/fail counts, just not via this status field.
      //
      // A real skip and a quarantined-test stub (docs/adr/0055) are both
      // stamped passed=false with a `SKIPPED:` details prefix -- excluded
      // here so the email's "N of M failed" count means genuine failures,
      // not "everything that isn't a pass." The dashboard and Excel/PDF
      // reports already made this same split (docs/adr's mid-August fix);
      // this email subject/body was the one spot that fix missed
      // (confirmed live 2026-09-04: a run with 125 real failures, 10 real
      // skips, and 4 quarantine stubs reported "139 of 364 test(s) failed").
      const failing = results.filter((r) => !r.passed && !isSkippedTestResult(r.details));
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'completed',
      });

      // Per the user: an execution report email goes out after every run,
      // not only on failure — clearly labeled "Staging" so it's never
      // confused with a Production report.
      const persistedResults = await this.resultRepository.listByRun(run.id);
      const model = buildQaAutomationReportModel(completed, persistedResults);
      const reportXlsx = await getQaAutomationReportGenerator('xlsx').generate(model);

      if (!skipEmail) {
        const oneDriveLink = await this.oneDriveUploader?.upload(
          input.orgId,
          formatOneDriveReportFilename(
            'qa-automation-report-staging',
            completed.completedAt ?? new Date(),
          ),
          reportXlsx,
        );
        const oneDriveLine = oneDriveLink ? `\n\nEditable copy on OneDrive: ${oneDriveLink}` : '';
        await this.emailSender.send({
          to: this.alertEmailTo,
          ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
          subject:
            failing.length > 0
              ? `[Staging] QA Automation Report: ${failing.length} of ${results.length} test(s) failed`
              : `[Staging] QA Automation Report: all ${results.length} test(s) passed`,
          body:
            (failing.length > 0
              ? failing.map((f) => `${f.testName}: ${f.details}`).join('\n\n')
              : `All ${results.length} test(s) passed. See the attached report for full details.`) +
            oneDriveLine,
          attachments: [
            {
              filename: `qa-automation-report-${run.id}.xlsx`,
              content: reportXlsx,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          ],
        });
      } else {
        console.error(
          `[staging run ${run.id}] report email skipped (${isRerun ? 'rerun' : 'STAGING_SKIP_EMAIL=true'})`,
        );
      }

      return completed;
    } catch (error) {
      // The report email is the intended notification channel, but a
      // crash this early (before any test result exists) has no other
      // visible trace otherwise — logging it too means it shows up in the
      // worker's own console output, not only in an inbox.
      console.error(`[staging run ${run.id}] crashed:`, error);
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'failed',
      });
      if (!skipEmail) {
        await this.emailSender.send({
          to: this.alertEmailTo,
          ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
          subject: '[Staging] QA Automation Alert: the run itself crashed',
          body: `The run crashed before any test could complete: ${(error as Error).message}`,
        });
      } else {
        console.error(
          `[staging run ${run.id}] crash alert email skipped (${isRerun ? 'rerun' : 'STAGING_SKIP_EMAIL=true'})`,
        );
      }
      return completed;
    }
  }
}
