import { describe, expect, it } from 'vitest';
import { RunQaAutomationSuiteUseCase } from './run-qa-automation-suite.use-case.js';
import { InMemoryQaAutomationRunRepository } from './testing/in-memory-qa-automation-run-repository.js';
import { InMemoryQaAutomationTestResultRepository } from './testing/in-memory-qa-automation-test-result-repository.js';
import { InMemoryEmailSender } from './testing/in-memory-email-sender.js';
import { FakePortalAutomationTest } from './testing/fake-portal-automation-test.js';
import { createFakeQaBrowserFactory } from './testing/fake-qa-browser.js';

const ORG_ID = 'org_1';
const ALERT_TO = 'alerts@example.com';

function setup() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const emailSender = new InMemoryEmailSender();
  const testA = new FakePortalAutomationTest('test-a', 'Test A');
  const testB = new FakePortalAutomationTest('test-b', 'Test B');
  const { factory, browser } = createFakeQaBrowserFactory();

  const useCase = new RunQaAutomationSuiteUseCase(
    runRepository,
    resultRepository,
    [testA, testB],
    factory,
    emailSender,
    ALERT_TO,
  );

  return {
    runRepository,
    resultRepository,
    emailSender,
    testA,
    testB,
    browser,
    useCase,
  };
}

describe('RunQaAutomationSuiteUseCase', () => {
  it('marks the run completed and still sends a report email (labeled Production) when every test passes', async () => {
    const { emailSender, useCase } = setup();

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.subject).toContain('[Production]');
    expect(emailSender.sent[0]?.subject).toContain('all');
  });

  it('marks the run completed (the suite did execute) and sends exactly one alert naming the failing test', async () => {
    const { testB, emailSender, useCase } = setup();
    testB.result = { passed: false, details: 'Sunday had a free slot' };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.body).toContain('Sunday had a free slot');
    expect(emailSender.sent[0]?.body).toContain('Test B');
  });

  it('attaches a real Excel report to the failing-test alert email', async () => {
    const { testB, emailSender, useCase } = setup();
    testB.result = { passed: false, details: 'Sunday had a free slot' };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    const sent = emailSender.sent[0];
    expect(sent?.attachments).toHaveLength(1);
    expect(sent?.attachments?.[0]?.filename).toBe(`qa-automation-report-${run.id}.xlsx`);
    expect(sent?.attachments?.[0]?.content.length).toBeGreaterThan(0);
  });

  it('CCs the configured address on a failure alert when one is set', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const emailSender = new InMemoryEmailSender();
    const failingTest = new FakePortalAutomationTest('t1', 'Test');
    failingTest.result = { passed: false, details: 'boom' };
    const useCase = new RunQaAutomationSuiteUseCase(
      runRepository,
      resultRepository,
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
    const { emailSender, testB, useCase } = setup();
    testB.result = { passed: false, details: 'boom' };

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(emailSender.sent[0]?.cc).toBeUndefined();
  });

  it('persists a QaAutomationTestResult per test', async () => {
    const { resultRepository, useCase } = setup();

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });
    const results = await resultRepository.listByRun(run.id);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.testId).sort()).toEqual(['test-a', 'test-b']);
  });

  it('runs every test together on both a scheduled and a manual trigger', async () => {
    const { testA, testB, useCase } = setup();

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });

    expect(testA.runCalls).toHaveLength(1);
    expect(testB.runCalls).toHaveLength(1);
  });

  it('always closes the browser, even after tests run', async () => {
    const { browser, useCase } = setup();

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(browser.closed).toBe(true);
    expect(browser.pagesOpened).toBe(2);
  });

  it('records a failing result (without throwing) if a test itself throws, and still marks the run completed', async () => {
    const { testB, resultRepository, useCase } = setup();
    testB.run = async () => {
      throw new Error('page.click timed out');
    };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });
    const results = await resultRepository.listByRun(run.id);
    const resultB = results.find((r) => r.testId === 'test-b');

    expect(run.status).toBe('completed');
    expect(resultB?.passed).toBe(false);
    expect(resultB?.details).toContain('page.click timed out');
  });

  it('marks the run failed and alerts, never leaving it stuck at "running", if the browser itself fails to launch', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const emailSender = new InMemoryEmailSender();
    const useCase = new RunQaAutomationSuiteUseCase(
      runRepository,
      resultRepository,
      [new FakePortalAutomationTest('test-a', 'Test A')],
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
