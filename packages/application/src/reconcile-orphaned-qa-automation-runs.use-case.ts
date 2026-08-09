import type { EmailSender, QaAutomationRun, QaAutomationRunRepository } from '@cqp/core';

/**
 * See docs/adr/0043. Run once at worker startup, before any new job is
 * accepted. A container restart mid-run (e.g. a deploy landing while a
 * long staging suite is still executing) kills the process before
 * RunQaAutomationSuiteUseCase/RunStagingTestSuiteUseCase's own try/catch
 * ever gets a chance to mark the run 'failed' — no amount of in-process
 * error handling can save that, since the process itself is gone. The
 * run is left stuck at 'running' forever, with no other visible signal
 * that anything went wrong (confirmed live: BullMQ itself correctly
 * fails the underlying job with "stalled more than allowable limit",
 * but that's invisible to this app's own DB/UI). Since only one job runs
 * at a time per queue, anything still 'running' when this worker boots
 * cannot possibly still be in progress — it's safe to mark it failed
 * unconditionally.
 */
export class ReconcileOrphanedQaAutomationRunsUseCase {
  constructor(
    private readonly runRepository: QaAutomationRunRepository,
    private readonly emailSender: EmailSender,
    private readonly alertEmailTo: string,
    private readonly alertEmailCc?: string,
  ) {}

  async execute(): Promise<QaAutomationRun[]> {
    const orphaned = await this.runRepository.findAllRunning();
    if (orphaned.length === 0) return [];

    const completed: QaAutomationRun[] = [];
    for (const run of orphaned) {
      completed.push(await this.runRepository.complete(run.orgId, run.id, { status: 'failed' }));
    }

    await this.emailSender.send({
      to: this.alertEmailTo,
      ...(this.alertEmailCc !== undefined ? { cc: this.alertEmailCc } : {}),
      subject: `[QA Automation] ${completed.length} run(s) marked failed after a restart`,
      body: completed
        .map(
          (r) =>
            `${r.environment} run ${r.id} (started ${r.startedAt.toISOString()}) was still 'running' when the service restarted — the underlying process was killed before it could finish, so it's been marked failed.`,
        )
        .join('\n\n'),
    });

    return completed;
  }
}
