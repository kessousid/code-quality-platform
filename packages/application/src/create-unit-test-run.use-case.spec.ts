import { describe, expect, it } from 'vitest';
import {
  InMemoryRepoRepository,
  InMemoryUnitTestQueueRegistry,
  InMemoryUnitTestRunRepository,
} from './testing/index.js';
import { CreateUnitTestRunUseCase } from './create-unit-test-run.use-case.js';
import { RepoNotFoundError } from './get-repo.use-case.js';

describe('CreateUnitTestRunUseCase', () => {
  it('creates a run and enqueues it', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueueRegistry,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
    });

    expect(run.status).toBe('queued');
    expect(run.generator).toBe('gemini'); // defaults when omitted (docs/adr/0026) — preserves existing behavior
    expect(unitTestQueueRegistry.forWorker('default').enqueued).toEqual([
      { orgId: 'org_1', runId: run.id },
    ]);
  });

  it('honors an explicit generator choice instead of defaulting', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueueRegistry,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
      generator: 'script',
    });

    expect(run.generator).toBe('script');
  });

  it('relays an apiKeyOverride to the enqueued job without ever persisting it on the run', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueueRegistry,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
      apiKeyOverride: 'AIzaSy-a-fake-override-key',
    });

    expect(unitTestQueueRegistry.forWorker('default').enqueued).toEqual([
      { orgId: 'org_1', runId: run.id, apiKeyOverride: 'AIzaSy-a-fake-override-key' },
    ]);
    expect(run).not.toHaveProperty('apiKeyOverride');
    expect(await unitTestRunRepository.findById('org_1', run.id)).not.toHaveProperty(
      'apiKeyOverride',
    );
  });

  it('rejects an unknown repoId', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueueRegistry,
    );

    await expect(
      useCase.execute({ orgId: 'org_1', repoId: 'no-such-repo', target: { path: 'x.ts' } }),
    ).rejects.toThrow(RepoNotFoundError);
  });

  it("enqueues through the repo's own workerId queue, not the default one", async () => {
    const repoRepository = new InMemoryRepoRepository();
    const unitTestRunRepository = new InMemoryUnitTestRunRepository();
    const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'laptop-repo',
      workerId: 'keshav-laptop',
    });
    const useCase = new CreateUnitTestRunUseCase(
      unitTestRunRepository,
      repoRepository,
      unitTestQueueRegistry,
    );

    const run = await useCase.execute({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
    });

    expect(unitTestQueueRegistry.forWorker('keshav-laptop').enqueued).toEqual([
      { orgId: 'org_1', runId: run.id },
    ]);
    expect(unitTestQueueRegistry.forWorker('default').enqueued).toHaveLength(0);
  });
});
