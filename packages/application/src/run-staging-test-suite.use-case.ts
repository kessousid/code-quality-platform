import type {
  EmailSender,
  QaAutomationRun,
  QaAutomationRunRepository,
  QaAutomationTestResultRepository,
  QaAutomationTrigger,
  StagingTestRunner,
} from '@cqp/core';
import { buildQaAutomationReportModel, getQaAutomationReportGenerator } from '@cqp/reporting';

export interface RunStagingTestSuiteInput {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
}

/**
 * See docs/adr/0036. Much simpler than RunQaAutomationSuiteUseCase — there's
 * no per-test frequency gating and no per-test browser page, since the
 * whole external pytest suite runs as one opaque subprocess call via
 * `testRunner.run()`. Same create-run -> run -> persist-results -> complete
 * -> alert-on-failure shape, and the same "the run itself can crash before
 * any test result exists" handling.
 */
export class RunStagingTestSuiteUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly resultRepository: QaAutomationTestResultRepository,
    private readonly testRunner: StagingTestRunner,
    private readonly emailSender: EmailSender,
    private readonly alertEmailTo: string,
    private readonly alertEmailCc?: string,
  ) {}

  async execute(input: RunStagingTestSuiteInput): Promise<QaAutomationRun> {
    const run = await this.runRepository.create({
      orgId: input.orgId,
      environment: 'staging',
      triggeredBy: input.triggeredBy,
    });

    try {
      const { results } = await this.testRunner.run();
      for (const result of results) {
        await this.resultRepository.create({ runId: run.id, ...result });
      }

      // Per the user: the run's own status reflects whether the suite
      // actually executed, not whether every individual test passed —
      // 'failed' is reserved for the run itself never getting the chance
      // to run (the catch block below), not for real per-test failures
      // recorded here. Those are still surfaced via the alert email and
      // the persisted pass/fail counts, just not via this status field.
      const failing = results.filter((r) => !r.passed);
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'completed',
      });

      if (failing.length > 0) {
        const persistedResults = await this.resultRepository.listByRun(run.id);
        const model = buildQaAutomationReportModel(completed, persistedResults);
        const reportXlsx = await getQaAutomationReportGenerator('xlsx').generate(model);

        await this.emailSender.send({
          to: this.alertEmailTo,
          ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
          subject: `Staging QA automation alert: ${failing.length} test(s) failed`,
          body: failing.map((f) => `${f.testName}: ${f.details}`).join('\n\n'),
          attachments: [
            {
              filename: `qa-automation-report-${run.id}.xlsx`,
              content: reportXlsx,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          ],
        });
      }

      return completed;
    } catch (error) {
      // The alert email is the intended notification channel, but a crash
      // this early (before any test result exists) has no other visible
      // trace otherwise — logging it too means it shows up in the worker's
      // own console output, not only in an inbox.
      console.error(`[staging run ${run.id}] crashed:`, error);
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'failed',
      });
      await this.emailSender.send({
        to: this.alertEmailTo,
        ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
        subject: 'Staging QA automation alert: the run itself crashed',
        body: `The run crashed before any test could complete: ${(error as Error).message}`,
      });
      return completed;
    }
  }
}
