import type { GitCheckoutProvider, ScanJobData } from '@cqp/core';
import type { PrismaClient } from '@cqp/db';
import { PrismaFindingRepository, PrismaRepoRepository, PrismaScanRepository } from '@cqp/db';
import { RunScanUseCase } from '@cqp/application';

/**
 * Thin, same split as healthcheck.job.ts: the real logic is
 * `RunScanUseCase` (packages/application, framework-free, unit-tested with
 * in-memory doubles — see docs/adr/0021). This just wires the real Prisma
 * client to it. `orgId` travels in the job payload (`ScanJobData`, shared
 * with the producer via `@cqp/core`) because the use case's ports are
 * tenant-scoped (every lookup needs it) — BullMQ jobs aren't behind the
 * API's auth guard, so nothing else establishes it. `checkoutProvider`/
 * `repoTokenDecryptionKey` are for a github/gitlab repo (docs/adr/0047) —
 * a no-op for the far more common 'local' repo case.
 */
export async function processRunScanJob(
  prisma: PrismaClient,
  data: ScanJobData,
  checkoutProvider: GitCheckoutProvider,
  repoTokenDecryptionKey: Buffer,
): Promise<void> {
  const scanRepository = new PrismaScanRepository(prisma);
  const repoRepository = new PrismaRepoRepository(prisma);
  const findingRepository = new PrismaFindingRepository(prisma);

  const useCase = new RunScanUseCase(
    scanRepository,
    repoRepository,
    findingRepository,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
  await useCase.execute(data.orgId, data.scanId);
}
