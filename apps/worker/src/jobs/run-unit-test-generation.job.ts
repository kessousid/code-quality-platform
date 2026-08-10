import type {
  GitCheckoutProvider,
  JestTestGenerator,
  TestGeneratorType,
  UnitTestJobData,
} from '@cqp/core';
import type { PrismaClient } from '@cqp/db';
import {
  PrismaGeneratedTestFileRepository,
  PrismaRepoRepository,
  PrismaTestCaseResultRepository,
  PrismaUnitTestRunRepository,
} from '@cqp/db';
import { RunUnitTestGenerationUseCase } from '@cqp/application';
import { GeminiJestTestGenerator } from '@cqp/gemini-test-generator';
import { ScriptJestTestGenerator } from '@cqp/script-test-generator';

/**
 * Same split as run-scan.job.ts (docs/adr/0021, 0024): the real logic is
 * `RunUnitTestGenerationUseCase` (framework-free, unit-tested with
 * in-memory doubles + fakes). This just wires the real Prisma client and
 * both real generators to it — the only place in the whole worker that
 * constructs `GeminiJestTestGenerator`/`ScriptJestTestGenerator`. Which
 * one actually runs is the persisted run's own choice (docs/adr/0026),
 * not fixed here — both are always constructed, and the use case picks.
 * `checkoutProvider`/`repoTokenDecryptionKey` are for a github/gitlab repo
 * (docs/adr/0047) — a no-op for the far more common 'local' repo case.
 */
export async function processRunUnitTestGenerationJob(
  prisma: PrismaClient,
  data: UnitTestJobData,
  checkoutProvider: GitCheckoutProvider,
  repoTokenDecryptionKey: Buffer,
): Promise<void> {
  const unitTestRunRepository = new PrismaUnitTestRunRepository(prisma);
  const repoRepository = new PrismaRepoRepository(prisma);
  const generatedTestFileRepository = new PrismaGeneratedTestFileRepository(prisma);
  const testCaseResultRepository = new PrismaTestCaseResultRepository(prisma);
  // A per-run apiKeyOverride (docs/adr/0037) takes priority over the
  // worker's own configured default — the escape hatch for when the
  // default key is out of quota. Never logged, never persisted anywhere
  // beyond this one job's already-transient BullMQ payload.
  const generators: Record<TestGeneratorType, JestTestGenerator> = {
    gemini: new GeminiJestTestGenerator(data.apiKeyOverride ?? process.env.GEMINI_API_KEY ?? ''),
    script: new ScriptJestTestGenerator(),
  };

  const useCase = new RunUnitTestGenerationUseCase(
    unitTestRunRepository,
    repoRepository,
    generatedTestFileRepository,
    testCaseResultRepository,
    generators,
    checkoutProvider,
    repoTokenDecryptionKey,
  );
  await useCase.execute(data.orgId, data.runId);
}
