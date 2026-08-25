import type {
  EmailSender,
  QaAutomationRun,
  QaAutomationRunRepository,
  QaAutomationTestResultRepository,
  QaAutomationTrigger,
} from '@cqp/core';
import { buildQaAutomationReportModel, getQaAutomationReportGenerator } from '@cqp/reporting';
import type { PortalAutomationTest } from '@cqp/qa-automation-tests';

/**
 * Kept structural (not a `playwright` import) so this package doesn't
 * need a hard dependency on Playwright's types — just whatever shape
 * `PortalAutomationTest.run` actually expects.
 */
type QaPage = Parameters<PortalAutomationTest['run']>[0];

export interface QaBrowser {
  newPage(): Promise<QaPage>;
  close(): Promise<void>;
}

export type QaBrowserFactory = () => Promise<QaBrowser>;

export interface RunQaAutomationSuiteInput {
  orgId: string;
  triggeredBy: QaAutomationTrigger;
}

/**
 * See docs/adr/0035, docs/adr/0042. One execution = the whole registered
 * test suite — a `QaAutomationRun` parent row plus one
 * `QaAutomationTestResult` child per test, mirroring Scan/Finding. Every
 * test runs together on every trigger, scheduled or manual — the
 * schedule itself (fixed twice-daily, docs/adr/0042) is what controls
 * cadence, not per-test gating. Sends one alert email if anything failed.
 *
 * Per the user: OneDrive upload is staging-only (see
 * RunStagingTestSuiteUseCase) -- production reports are email-only, no
 * `oneDriveUploader` constructor param here.
 */
export class RunQaAutomationSuiteUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly resultRepository: QaAutomationTestResultRepository,
    private readonly tests: PortalAutomationTest[],
    private readonly browserFactory: QaBrowserFactory,
    private readonly emailSender: EmailSender,
    private readonly alertEmailTo: string,
    private readonly alertEmailCc?: string,
  ) {}

  async execute(input: RunQaAutomationSuiteInput): Promise<QaAutomationRun> {
    const run = await this.runRepository.create({
      orgId: input.orgId,
      environment: 'production',
      triggeredBy: input.triggeredBy,
    });

    // Everything below can throw for reasons that have nothing to do with
    // an individual test (e.g. the browser itself fails to launch) — that
    // must still mark the run failed and alert, not leave it stuck at
    // 'running' forever with no test ever having gotten the chance to
    // record its own per-test failure.
    try {
      const results = await this.runTests(this.tests);
      for (const result of results) {
        await this.resultRepository.create({ runId: run.id, ...result });
      }

      // Per the user: the run's own status reflects whether the suite
      // actually executed, not whether every individual test passed —
      // 'failed' is reserved for the run itself never getting the chance
      // to run (the catch block below), not for real per-test failures
      // recorded here. Those are still surfaced via the report email and
      // the persisted pass/fail counts, just not via this status field.
      const failing = results.filter((r) => !r.passed);
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'completed',
      });

      // Per the user: an execution report email goes out after every run,
      // not only on failure — clearly labeled "Production" so it's never
      // confused with a Staging report.
      const persistedResults = await this.resultRepository.listByRun(run.id);
      const model = buildQaAutomationReportModel(completed, persistedResults);
      const reportXlsx = await getQaAutomationReportGenerator('xlsx').generate(model);

      await this.emailSender.send({
        to: this.alertEmailTo,
        ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
        subject:
          failing.length > 0
            ? `[Production] QA Automation Report: ${failing.length} of ${results.length} test(s) failed`
            : `[Production] QA Automation Report: all ${results.length} test(s) passed`,
        body:
          failing.length > 0
            ? failing.map((f) => `${f.testName}: ${f.details}`).join('\n\n')
            : `All ${results.length} test(s) passed. See the attached report for full details.`,
        attachments: [
          {
            filename: `qa-automation-report-${run.id}.xlsx`,
            content: reportXlsx,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
      });

      return completed;
    } catch (error) {
      // The report email is the intended notification channel, but a
      // crash this early (before any test result exists) has no other
      // visible trace otherwise — logging it too means it shows up in the
      // worker's own console output, not only in an inbox.
      console.error(`[qa-automation run ${run.id}] crashed:`, error);
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'failed',
      });
      await this.emailSender.send({
        to: this.alertEmailTo,
        ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
        subject: '[Production] QA Automation Alert: the run itself crashed',
        body: `The run crashed before any test could complete: ${(error as Error).message}`,
      });
      return completed;
    }
  }

  private async runTests(
    tests: PortalAutomationTest[],
  ): Promise<{ testId: string; testName: string; passed: boolean; details: string }[]> {
    const browser = await this.browserFactory();
    try {
      const results = [];
      for (const test of tests) {
        const page = await browser.newPage();
        try {
          const result = await test.run(page);
          results.push({
            testId: test.id,
            testName: test.name,
            passed: result.passed,
            details: result.details,
          });
        } catch (error) {
          results.push({
            testId: test.id,
            testName: test.name,
            passed: false,
            details: `Threw an error: ${(error as Error).message}`,
          });
        }
      }
      return results;
    } finally {
      await browser.close();
    }
  }
}
