import { describe, expect, it } from 'vitest';
import { RunQaAutomationSuiteUseCase } from './run-qa-automation-suite.use-case.js';
import { InMemoryQaAutomationRunRepository } from './testing/in-memory-qa-automation-run-repository.js';
import { InMemoryQaAutomationTestResultRepository } from './testing/in-memory-qa-automation-test-result-repository.js';
import { InMemoryQaAutomationScheduleRepository } from './testing/in-memory-qa-automation-schedule-repository.js';
import { InMemoryEmailSender } from './testing/in-memory-email-sender.js';
import { FakePortalAutomationTest } from './testing/fake-portal-automation-test.js';
import { createFakeQaBrowserFactory } from './testing/fake-qa-browser.js';

const ORG_ID = 'org_1';
const ALERT_TO = 'alerts@example.com';

function setup() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const scheduleRepository = new InMemoryQaAutomationScheduleRepository();
  const emailSender = new InMemoryEmailSender();
  const everyRunTest = new FakePortalAutomationTest(
    'every-run-test',
    'Every-run test',
    'every-run',
  );
  const dailyTest = new FakePortalAutomationTest('daily-test', 'Daily test', 'daily');
  const { factory, browser } = createFakeQaBrowserFactory();

  const useCase = new RunQaAutomationSuiteUseCase(
    runRepository,
    resultRepository,
    scheduleRepository,
    [everyRunTest, dailyTest],
    factory,
    emailSender,
    ALERT_TO,
  );

  return {
    runRepository,
    resultRepository,
    scheduleRepository,
    emailSender,
    everyRunTest,
    dailyTest,
    browser,
    useCase,
  };
}

describe('RunQaAutomationSuiteUseCase', () => {
  it('marks the run completed and sends no email when every test passes', async () => {
    const { emailSender, useCase } = setup();

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('marks the run completed (the suite did execute) and sends exactly one alert naming the failing test', async () => {
    const { dailyTest, emailSender, useCase } = setup();
    dailyTest.result = { passed: false, details: 'Sunday had a free slot' };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.body).toContain('Sunday had a free slot');
    expect(emailSender.sent[0]?.body).toContain('Daily test');
  });

  it('attaches a real Excel report to the failing-test alert email', async () => {
    const { dailyTest, emailSender, useCase } = setup();
    dailyTest.result = { passed: false, details: 'Sunday had a free slot' };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    const sent = emailSender.sent[0];
    expect(sent?.attachments).toHaveLength(1);
    expect(sent?.attachments?.[0]?.filename).toBe(`qa-automation-report-${run.id}.xlsx`);
    expect(sent?.attachments?.[0]?.content.length).toBeGreaterThan(0);
  });

  it('CCs the configured address on a failure alert when one is set', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const scheduleRepository = new InMemoryQaAutomationScheduleRepository();
    const emailSender = new InMemoryEmailSender();
    const failingTest = new FakePortalAutomationTest('t1', 'Test', 'every-run');
    failingTest.result = { passed: false, details: 'boom' };
    const useCase = new RunQaAutomationSuiteUseCase(
      runRepository,
      resultRepository,
      scheduleRepository,
      [failingTest],
      createFakeQaBrowserFactory().factory,
      emailSender,
      ALERT_TO,
      'cc@example.com',
    );

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(emailSender.sent[0]?.cc).toBe('cc@example.com');
  });

  it('omits cc on a failure alert when none is configured', async () => {
    const { emailSender, dailyTest, useCase } = setup();
    dailyTest.result = { passed: false, details: 'boom' };

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(emailSender.sent[0]?.cc).toBeUndefined();
  });

  it('persists a QaAutomationTestResult per test', async () => {
    const { resultRepository, useCase } = setup();

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });
    const results = await resultRepository.listByRun(run.id);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.testId).sort()).toEqual(['daily-test', 'every-run-test']);
  });

  it('on a scheduled trigger, skips the daily test if it already ran today', async () => {
    const { scheduleRepository, everyRunTest, dailyTest, useCase } = setup();
    await scheduleRepository.update(ORG_ID, { lastDailyCheckAt: new Date() });

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });

    expect(everyRunTest.runCalls).toHaveLength(1);
    expect(dailyTest.runCalls).toHaveLength(0);
  });

  it('on a scheduled trigger, runs the daily test if it has not run today and stamps lastDailyCheckAt', async () => {
    const { scheduleRepository, dailyTest, useCase } = setup();

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });

    expect(dailyTest.runCalls).toHaveLength(1);
    const schedule = await scheduleRepository.get(ORG_ID);
    expect(schedule.lastDailyCheckAt).toBeInstanceOf(Date);
  });

  it('a manual trigger always runs every test regardless of lastDailyCheckAt', async () => {
    const { scheduleRepository, everyRunTest, dailyTest, useCase } = setup();
    await scheduleRepository.update(ORG_ID, { lastDailyCheckAt: new Date() });

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(everyRunTest.runCalls).toHaveLength(1);
    expect(dailyTest.runCalls).toHaveLength(1);
  });

  it('always closes the browser, even after tests run', async () => {
    const { browser, useCase } = setup();

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(browser.closed).toBe(true);
    expect(browser.pagesOpened).toBe(2);
  });

  it('records a failing result (without throwing) if a test itself throws, and still marks the run completed', async () => {
    const { dailyTest, resultRepository, useCase } = setup();
    dailyTest.run = async () => {
      throw new Error('page.click timed out');
    };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });
    const results = await resultRepository.listByRun(run.id);
    const dailyResult = results.find((r) => r.testId === 'daily-test');

    expect(run.status).toBe('completed');
    expect(dailyResult?.passed).toBe(false);
    expect(dailyResult?.details).toContain('page.click timed out');
  });

  it('marks the run failed and alerts, never leaving it stuck at "running", if the browser itself fails to launch', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const scheduleRepository = new InMemoryQaAutomationScheduleRepository();
    const emailSender = new InMemoryEmailSender();
    const useCase = new RunQaAutomationSuiteUseCase(
      runRepository,
      resultRepository,
      scheduleRepository,
      [new FakePortalAutomationTest('every-run-test', 'Every-run test', 'every-run')],
      () => Promise.reject(new Error("browserType.launch: Executable doesn't exist")),
      emailSender,
      ALERT_TO,
    );

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('failed');
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.body).toContain("browserType.launch: Executable doesn't exist");
  });
});
