import type {
  Finding,
  FindingRepository,
  GitCheckoutProvider,
  RepoRepository,
  Scan,
  ScanRepository,
  ScanTarget,
} from '@cqp/core';
import {
  builtinPlugins,
  computeChangedFiles,
  runScan,
  type PluginDescriptor,
  type PluginRunStatus,
  type ScanProgressEvent,
} from '@cqp/scan-engine';
import { computeFingerprint } from '@cqp/correlation';
import { ensureLocalCheckout } from './ensure-local-checkout.js';
import { RepoNotFoundError } from './get-repo.use-case.js';
import { ScanNotFoundError } from './get-scan.use-case.js';

const DEFAULT_TIMEOUT_MS_PER_PLUGIN = 120_000;

/** How often `execute()` checks the DB for a cancellation request while a scan is running — see docs/adr/0023. */
const CANCEL_POLL_INTERVAL_MS = 1000;

/**
 * The orchestration ADR-0006/0018/0009 all deferred — see docs/adr/0021
 * for the full design. Framework-free on purpose (ADR-0010): `apps/worker`
 * is just a BullMQ `Worker` that loads Prisma-backed repositories and
 * calls `execute()`. Every branch here is testable with in-memory
 * doubles, no Redis or Postgres required.
 */
export class RunScanUseCase {
  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly repoRepository: RepoRepository,
    private readonly findingRepository: FindingRepository,
    private readonly checkoutProvider: GitCheckoutProvider,
    private readonly repoTokenDecryptionKey: Buffer,
    private readonly timeoutMsPerPlugin: number = DEFAULT_TIMEOUT_MS_PER_PLUGIN,
  ) {}

  async execute(orgId: string, scanId: string): Promise<void> {
    const scan = await this.scanRepository.findById(orgId, scanId);
    if (!scan) {
      throw new ScanNotFoundError(scanId);
    }
    if (scan.status === 'cancelled') {
      // Cancelled while still queued (see docs/adr/0023) — the BullMQ job
      // removal in CancelScanUseCase races with the worker picking it up
      // anyway, so this guard is what actually prevents it from running.
      return;
    }

    const repo = await this.repoRepository.findById(orgId, scan.repoId);
    if (!repo) {
      throw new RepoNotFoundError(scan.repoId);
    }

    await this.scanRepository.updateStatus(orgId, scanId, 'running');

    const plugins = this.selectPlugins(scan.categories);
    const controller = new AbortController();
    const cancelPoll = this.startCancelPoll(orgId, scanId, controller);
    const onProgress = this.buildProgressHandler(orgId, scanId);

    try {
      // docs/adr/0047: for a 'local' repo this is today's exact guard,
      // just relocated (same error/message) — for github/gitlab it clones
      // fresh. Either way `cleanup()` below always removes whatever was
      // materialized, or is a no-op for the local case.
      const { repoRoot, cleanup } = await ensureLocalCheckout(
        repo,
        scan.ref,
        this.checkoutProvider,
        this.repoTokenDecryptionKey,
      );
      try {
        const target = await this.resolveTarget(orgId, repoRoot, scan);

        const { findings, pluginStatuses } = await runScan(
          plugins,
          { scanId, orgId, repoId: repo.id, target },
          { timeoutMsPerPlugin: this.timeoutMsPerPlugin, onProgress, signal: controller.signal },
        );

        if (controller.signal.aborted) {
          // Status is already 'cancelled' (CancelScanUseCase set it) — leave
          // it as-is and skip persisting a partial/inconsistent finding set.
          return;
        }

        this.logFailedPlugins(scanId, pluginStatuses);
        await this.persistFindings(orgId, repo.id, scanId, findings);

        await this.scanRepository.updateStatus(orgId, scanId, 'completed');
      } finally {
        await cleanup();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await this.scanRepository.updateStatus(orgId, scanId, 'failed');
      }
      throw error;
    } finally {
      clearInterval(cancelPoll);
    }
  }

  /** Incremental mode narrows to real `git diff` output (Phase 7) between the base scan's ref and this scan's ref, in the same local checkout. */
  private async resolveTarget(
    orgId: string,
    repoRoot: string,
    scan: { mode: string; ref: string; baseScanId?: string },
  ): Promise<ScanTarget> {
    if (scan.mode !== 'incremental' || scan.baseScanId === undefined) {
      return { repoRoot };
    }

    const baseScan = await this.scanRepository.findById(orgId, scan.baseScanId);
    if (!baseScan) {
      throw new ScanNotFoundError(scan.baseScanId);
    }

    const changedFiles = await computeChangedFiles(repoRoot, baseScan.ref, scan.ref);
    return { repoRoot, changedFiles };
  }

  /** Logged, not persisted — see docs/adr/0021 (no schema column for per-scan plugin status yet). One plugin failing never invalidates the rest (ADR-0018). */
  private logFailedPlugins(scanId: string, pluginStatuses: PluginRunStatus[]): void {
    const failedPlugins = pluginStatuses.filter((s) => s.status !== 'success');
    if (failedPlugins.length > 0) {
      console.warn(
        `[scan ${scanId}] ${failedPlugins.length} plugin(s) did not complete:`,
        failedPlugins,
      );
    }
  }

  private async persistFindings(
    orgId: string,
    repoId: string,
    scanId: string,
    findings: Finding[],
  ): Promise<void> {
    for (const finding of findings) {
      const fingerprint = computeFingerprint({
        category: finding.category,
        source: finding.source,
        ruleId: finding.ruleId,
        primaryFilePath: finding.locations[0]?.filePath ?? '',
      });

      await this.findingRepository.upsertFromScan({
        orgId,
        repoId,
        scanId,
        fingerprint,
        category: finding.category,
        source: finding.source,
        ruleId: finding.ruleId,
        title: finding.title,
        severity: finding.severity,
        confidence: finding.confidence,
        locations: finding.locations,
        rootCause: finding.rootCause,
        riskDescription: finding.riskDescription,
        recommendedFix: finding.recommendedFix,
        references: finding.references,
        ...(finding.cwe !== undefined ? { cwe: finding.cwe } : {}),
        ...(finding.owaspCategory !== undefined ? { owaspCategory: finding.owaspCategory } : {}),
        ...(finding.exampleCode !== undefined ? { exampleCode: finding.exampleCode } : {}),
      });
    }
  }

  private selectPlugins(categories: Scan['categories']): PluginDescriptor[] {
    if (!categories || categories.length === 0) {
      return builtinPlugins;
    }
    return builtinPlugins.filter((plugin) => plugin.categories.some((c) => categories.includes(c)));
  }

  /**
   * Cancelling a *running* scan (see docs/adr/0023) can only be signalled
   * cross-process: the cancel request lands in the API process, this loop
   * runs in the worker process. Polling the DB is the bridge — no pub/sub
   * infra needed for six plugins finishing within ~minutes.
   */
  private startCancelPoll(
    orgId: string,
    scanId: string,
    controller: AbortController,
  ): NodeJS.Timeout {
    return setInterval(() => {
      void this.scanRepository.findById(orgId, scanId).then((current) => {
        if (current?.status === 'cancelled') {
          controller.abort();
        }
      });
    }, CANCEL_POLL_INTERVAL_MS);
  }

  /** Best-effort: a progress-write failure must never fail the scan. */
  private buildProgressHandler(orgId: string, scanId: string): (event: ScanProgressEvent) => void {
    let completedCount = 0;
    return (event) => {
      if (event.type === 'total') {
        void this.scanRepository
          .updateProgress(orgId, scanId, { pluginsTotal: event.total, pluginsCompleted: 0 })
          .catch(() => {});
      } else if (event.type === 'plugin-start') {
        void this.scanRepository
          .updateProgress(orgId, scanId, { currentPluginId: event.pluginId })
          .catch(() => {});
      } else {
        completedCount += 1;
        void this.scanRepository
          .updateProgress(orgId, scanId, { pluginsCompleted: completedCount })
          .catch(() => {});
      }
    };
  }
}
