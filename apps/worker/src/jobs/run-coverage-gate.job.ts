import type { CoverageJobData, GitCheckoutProvider } from '@cqp/core';
import type { PrismaClient } from '@cqp/db';
import {
  PrismaCoverageFileResultRepository,
  PrismaCoverageRunRepository,
  PrismaRepoRepository,
} from '@cqp/db';
import { RunCoverageGateUseCase } from '@cqp/application';

/**
 * Same split as run-unit-test-generation.job.ts (docs/adr/0021, 0024,
 * 0025): the real logic is `RunCoverageGateUseCase` (framework-free,
 * unit-tested with in-memory doubles + real git/jest). This just wires the
 * real Prisma client to it — zero LLM anywhere in this job, unlike its
 * unit-test-generation sibling. `checkoutProvider`/`repoTokenDecryptionKey`
 * are for a github/gitlab repo (docs/adr/0047) — a no-op for the far more
 * common 'local' repo case.
 */
export async function processRunCoverageGateJob(
  prisma: PrismaClient,
  data: CoverageJobData,
  checkoutProvider: GitCheckoutProvider,
  repoTokenDecryptionKey: Buffer,
): Promise<void> {
  const coverageRunRepository = new PrismaCoverageRunRepository(prisma);
  const repoRepository = new PrismaRepoRepository(prisma);
  const coverageFileResultRepository = new PrismaCoverageFileResultRepository(prisma);

  const useCase = new RunCoverageGateUseCase(
    coverageRunRepository,
    repoRepository,
    coverageFileResultRepository,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
  await useCase.execute(data.orgId, data.runId);
}
