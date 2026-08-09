import { describe, expect, it } from 'vitest';
import { InMemoryQaAutomationRunRepository } from './testing/in-memory-qa-automation-run-repository.js';
import { InMemoryEmailSender } from './testing/in-memory-email-sender.js';
import { ReconcileOrphanedQaAutomationRunsUseCase } from './reconcile-orphaned-qa-automation-runs.use-case.js';

const ALERT_TO = 'alerts@example.com';

describe('ReconcileOrphanedQaAutomationRunsUseCase', () => {
  it('does nothing and sends no email when no run is stuck running', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const emailSender = new InMemoryEmailSender();
    const useCase = new ReconcileOrphanedQaAutomationRunsUseCase(
      runRepository,
      emailSender,
      ALERT_TO,
    );

    const result = await useCase.execute();

    expect(result).toEqual([]);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('marks every still-running run failed and sends one summary alert', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const emailSender = new InMemoryEmailSender();
    const orphanA = await runRepository.create({
      orgId: 'org_1',
      environment: 'staging',
      triggeredBy: 'scheduled',
    });
    const orphanB = await runRepository.create({
      orgId: 'org_1',
      environment: 'production',
      triggeredBy: 'manual',
    });
    const useCase = new ReconcileOrphanedQaAutomationRunsUseCase(
      runRepository,
      emailSender,
      ALERT_TO,
    );

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 'failed')).toBe(true);
    expect(result.every((r) => r.completedAt instanceof Date)).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.subject).toContain('2 run(s)');
    expect(emailSender.sent[0]?.body).toContain(orphanA.id);
    expect(emailSender.sent[0]?.body).toContain(orphanB.id);
  });

  it('never touches an already-terminal run', async () => {
    const runRepository = new InMemoryQaAutomationRunRepository();
    const emailSender = new InMemoryEmailSender();
    const finished = await runRepository.create({
      orgId: 'org_1',
      environment: 'production',
      triggeredBy: 'manual',
    });
    await runRepository.complete('org_1', finished.id, { status: 'completed' });
    const useCase = new ReconcileOrphanedQaAutomationRunsUseCase(
      runRepository,
      emailSender,
      ALERT_TO,
    );

    const result = await useCase.execute();

    expect(result).toEqual([]);
    expect(emailSender.sent).toHaveLength(0);
  });
});
