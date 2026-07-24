import type {
  CreateScanInput,
  RepoRepository,
  Scan,
  ScanQueueRegistry,
  ScanRepository,
} from '@cqp/core';
import { RepoNotFoundError } from './get-repo.use-case.js';

/**
 * Application layer (see docs/adr/0010): depends only on domain ports,
 * never on Prisma or NestJS. apps/api wraps this in a thin provider; it
 * does not need to know that to be tested.
 *
 * Phase 6 closed a gap Phase 5 flagged: repoId is checked against a real
 * repo in this org before a scan is created. Phase 8's worker-wiring pass
 * (docs/adr/0021) closes the next one: creating a `Scan` row used to be
 * the entire effect of this use case — nothing ever told a worker to
 * actually run it. It now enqueues through `ScanQueue` right after.
 * docs/adr/0031 adds one more step: `repo.workerId` picks which real
 * queue (and so which worker instance) actually receives the job.
 */
export class CreateScanUseCase {
  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly repoRepository: RepoRepository,
    private readonly scanQueueRegistry: ScanQueueRegistry,
  ) {}

  async execute(input: CreateScanInput): Promise<Scan> {
    if (input.mode === 'incremental' && !input.baseScanId) {
      throw new Error('An incremental scan requires a baseScanId');
    }

    const repo = await this.repoRepository.findById(input.orgId, input.repoId);
    if (!repo) {
      throw new RepoNotFoundError(input.repoId);
    }

    const scan = await this.scanRepository.create(input);
    await this.scanQueueRegistry
      .forWorker(repo.workerId)
      .enqueue({ orgId: input.orgId, scanId: scan.id });
    return scan;
  }
}
