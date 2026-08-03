import type {
  EmailSender,
  QaAutomationRun,
  QaAutomationRunRepository,
  QaAutomationSchedule,
  QaAutomationScheduleRepository,
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
 * See docs/adr/0035. One execution = the whole registered test suite —
 * a `QaAutomationRun` parent row plus one `QaAutomationTestResult` child
 * per test, mirroring Scan/Finding. `'daily'`-frequency tests only run
 * automatically once per calendar day (tracked via
 * `schedule.lastDailyCheckAt`); a `'manual'` trigger always runs
 * everything. Sends one alert email if anything failed.
 */
export class RunQaAutomationSuiteUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly resultRepository: QaAutomationTestResultRepository,
    private readonly scheduleRepository: QaAutomationScheduleRepository,
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
      const schedule = await this.scheduleRepository.get(input.orgId);
      const testsToRun = this.selectTests(input.triggeredBy, schedule);

      const results = await this.runTests(testsToRun);
      for (const result of results) {
        await this.resultRepository.create({ runId: run.id, ...result });
      }

      if (input.triggeredBy === 'scheduled' && testsToRun.some((t) => t.frequency === 'daily')) {
        await this.scheduleRepository.update(input.orgId, { lastDailyCheckAt: new Date() });
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
          subject: `QA automation alert: ${failing.length} test(s) failed`,
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
      const completed = await this.runRepository.complete(input.orgId, run.id, {
        status: 'failed',
      });
      await this.emailSender.send({
        to: this.alertEmailTo,
        ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
        subject: 'QA automation alert: the run itself crashed',
        body: `The run crashed before any test could complete: ${(error as Error).message}`,
      });
      return completed;
    }
  }

  private selectTests(
    triggeredBy: QaAutomationTrigger,
    schedule: QaAutomationSchedule,
  ): PortalAutomationTest[] {
    if (triggeredBy === 'manual') return this.tests;
    const ranDailyToday =
      schedule.lastDailyCheckAt !== undefined &&
      isSameCalendarDay(schedule.lastDailyCheckAt, new Date());
    return this.tests.filter((t) => t.frequency === 'every-run' || !ranDailyToday);
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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
