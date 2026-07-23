import { describe, expect, it } from 'vitest';
import {
  InMemoryRepoRepository,
  InMemoryUnitTestQueue,
  InMemoryUnitTestRunRepository,
} from './testing/index.js';
import { CreateUnitTestRunUseCase } from './create-unit-test-run.use-case.js';
import { RepoNotFoundError } from './get-repo.use-case.js';

describe('CreateUnitTestRunUseCase', () => {
  it('creates a run and enqueues it', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueue = new InMemoryUnitTestQueue();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueue,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
    });

    expect(run.status).toBe('queued');
    expect(run.generator).toBe('gemini'); // defaults when omitted (docs/adr/0026) — preserves existing behavior
    expect(unitTestQueue.enqueued).toEqual([{ orgId: 'org_1', runId: run.id }]);
  });

  it('honors an explicit generator choice instead of defaulting', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueue = new InMemoryUnitTestQueue();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueue,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
      generator: 'script',
    });

    expect(run.generator).toBe('script');
  });

  it('rejects an unknown repoId', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueue = new InMemoryUnitTestQueue();
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueue,
    );

    await expect(
      useCase.execute({ orgId: 'org_1', repoId: 'no-such-repo', target: { path: 'x.ts' } }),
    ).rejects.toThrow(RepoNotFoundError);
  });
});
