import { describe, expect, it } from 'vitest';
import { RunStagingTestSuiteUseCase } from './run-staging-test-suite.use-case.js';
import { InMemoryQaAutomationRunRepository } from './testing/in-memory-qa-automation-run-repository.js';
import { InMemoryQaAutomationTestResultRepository } from './testing/in-memory-qa-automation-test-result-repository.js';
import { InMemoryEmailSender } from './testing/in-memory-email-sender.js';
import { FakeStagingTestRunner } from './testing/fake-staging-test-runner.js';

const ORG_ID = 'org_1';
const ALERT_TO = 'alerts@example.com';

function setup() {
  const runRepository = new InMemoryQaAutomationRunRepository();
  const resultRepository = new InMemoryQaAutomationTestResultRepository();
  const emailSender = new InMemoryEmailSender();
  const testRunner = new FakeStagingTestRunner();

  const useCase = new RunStagingTestSuiteUseCase(
    runRepository,
    resultRepository,
    testRunner,
    emailSender,
    ALERT_TO,
  );

  return { runRepository, resultRepository, emailSender, testRunner, useCase };
}

describe('RunStagingTestSuiteUseCase', () => {
  it('marks the run completed with environment "staging" and still sends a report email (labeled Staging) when every test passes', async () => {
    const { emailSender, useCase } = setup();

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(run.environment).toBe('staging');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.subject).toContain('[Staging]');
    expect(emailSender.sent[0]?.subject).toContain('all');
  });

  it('marks the run completed (the suite did execute) and sends exactly one alert with a real Excel attachment when a test fails', async () => {
    const { testRunner, emailSender, useCase } = setup();
    testRunner.result = {
      results: [
        { testId: 't1', testName: 'candidate login', passed: true, details: 'ok' },
        { testId: 't2', testName: 'employer login', passed: false, details: 'locator not found' },
      ],
    };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(1);
    const sent = emailSender.sent[0];
    expect(sent?.body).toContain('employer login');
    expect(sent?.body).toContain('locator not found');
    expect(sent?.attachments).toHaveLength(1);
    expect(sent?.attachments?.[0]?.filename).toBe(`qa-automation-report-${run.id}.xlsx`);
    expect(sent?.attachments?.[0]?.content.length).toBeGreaterThan(0);
  });

  it('excludes real skips and quarantine stubs from the "failed" count and subject line (docs/adr/0063)', async () => {
    const { testRunner, emailSender, useCase } = setup();
    testRunner.result = {
      results: [
        { testId: 't1', testName: 'candidate login', passed: true, details: 'ok' },
        { testId: 't2', testName: 'employer login', passed: false, details: 'locator not found' },
        {
          testId: 't3',
          testName: 'coach dashboard',
          passed: false,
          details: 'SKIPPED: 404 in this environment',
        },
        {
          testId: 't4',
          testName: 'TC_PANELADMIN_048',
          passed: false,
          details: 'SKIPPED: Deselected before this run -- known to hang. Not executed.',
        },
      ],
    };

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(emailSender.sent).toHaveLength(1);
    const sent = emailSender.sent[0];
    expect(sent?.subject).toBe('[Staging] QA Automation Report: 1 of 4 test(s) failed');
    expect(sent?.body).toContain('employer login');
    expect(sent?.body).not.toContain('coach dashboard');
    expect(sent?.body).not.toContain('TC_PANELADMIN_048');
  });

  it('persists a QaAutomationTestResult per result returned by the test runner', async () => {
    const { testRunner, resultRepository, useCase } = setup();
    testRunner.result = {
      results: [
        { testId: 't1', testName: 'a', passed: true, details: 'ok' },
        { testId: 't2', testName: 'b', passed: true, details: 'ok' },
      ],
    };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });
    const results = await resultRepository.listByRun(run.id);

    expect(results.map((r) => r.testId).sort()).toEqual(['t1', 't2']);
  });

  it('marks the run failed and alerts, never leaving it stuck at "running", if the test runner itself throws', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const emailSender = new InMemoryEmailSender();
    const testRunner = new FakeStagingTestRunner();
    testRunner.run = () => Promise.reject(new Error('git clone failed: repository not found'));
    const useCase = new RunStagingTestSuiteUseCase(
      runRepository,
      resultRepository,
      testRunner,
      emailSender,
      ALERT_TO,
    );

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });

    expect(run.status).toBe('failed');
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.body).toContain('git clone failed: repository not found');
  });

  it('persists progress reported by the test runner via updateProgress (docs/adr/0044)', async () => {
    const { runRepository, testRunner, useCase } = setup();
    testRunner.run = async (onProgress?: (percent: number) => void) => {
      onProgress?.(50);
      return testRunner.result;
    };

    const run = await useCase.execute({ orgId: ORG_ID, triggeredBy: 'scheduled' });

    const persisted = await runRepository.findById(ORG_ID, run.id);
    expect(persisted?.progressPercent).toBe(50);
  });

  it('skips the report email for a "rerun failed/skipped tests" run (onlyTestNames set), but still persists results normally', async () => {
    const { testRunner, emailSender, resultRepository, useCase } = setup();
    testRunner.result = {
      results: [{ testId: 't1', testName: 'a', passed: false, details: 'still broken' }],
    };

    const run = await useCase.execute({
      orgId: ORG_ID,
      triggeredBy: 'manual',
      onlyTestNames: ['test_a'],
    });

    expect(run.status).toBe('completed');
    expect(emailSender.sent).toHaveLength(0);
    const results = await resultRepository.listByRun(run.id);
    expect(results).toHaveLength(1);
  });

  it('skips the crash alert email too when the runner throws during a rerun', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const emailSender = new InMemoryEmailSender();
    const testRunner = new FakeStagingTestRunner();
    testRunner.run = () => Promise.reject(new Error('boom'));
    const useCase = new RunStagingTestSuiteUseCase(
      runRepository,
      resultRepository,
      testRunner,
      emailSender,
      ALERT_TO,
    );

    const run = await useCase.execute({
      orgId: ORG_ID,
      triggeredBy: 'manual',
      onlyTestNames: ['test_a'],
    });

    expect(run.status).toBe('failed');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('CCs the configured address on a failure alert when one is set', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const resultRepository = new InMemoryQaAutomationTestResultRepository();
    const emailSender = new InMemoryEmailSender();
    const testRunner = new FakeStagingTestRunner();
    testRunner.result = {
      results: [{ testId: 't1', testName: 'a', passed: false, details: 'boom' }],
    };
    const useCase = new RunStagingTestSuiteUseCase(
      runRepository,
      resultRepository,
      testRunner,
      emailSender,
      ALERT_TO,
      'cc@example.com',
    );

    await useCase.execute({ orgId: ORG_ID, triggeredBy: 'manual' });

    expect(emailSender.sent[0]?.cc).toBe('cc@example.com');
  });
});
