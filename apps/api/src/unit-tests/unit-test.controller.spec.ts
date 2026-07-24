import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  CancelUnitTestRunUseCase,
  CreateUnitTestRunUseCase,
  GetUnitTestRunUseCase,
  ListGeneratedTestFilesByRunUseCase,
  ListTestCaseResultsByRunUseCase,
  ListUnitTestRunsByRepoUseCase,
} from '@cqp/application';
import {
  InMemoryGeneratedTestFileRepository,
  InMemoryRepoRepository,
  InMemoryTestCaseResultRepository,
  InMemoryUnitTestQueueRegistry,
  InMemoryUnitTestRunRepository,
} from '@cqp/application/testing';
import { UnitTestController } from './unit-test.controller.js';

async function buildTestingModule() {
  const unitTestRunRepository = new InMemoryUnitTestRunRepository();
  const repoRepository = new InMemoryRepoRepository();
  const generatedTestFileRepository = new InMemoryGeneratedTestFileRepository();
  const testCaseResultRepository = new InMemoryTestCaseResultRepository();
  const unitTestQueueRegistry = new InMemoryUnitTestQueueRegistry();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const unitTestQueue = unitTestQueueRegistry.forWorker(repo.workerId);

  const moduleRef = await Test.createTestingModule({
    controllers: [UnitTestController],
    providers: [
      {
        provide: CreateUnitTestRunUseCase,
        useValue: new CreateUnitTestRunUseCase(
          unitTestRunRepository,
          repoRepository,
          unitTestQueueRegistry,
        ),
      },
      {
        provide: GetUnitTestRunUseCase,
        useValue: new GetUnitTestRunUseCase(unitTestRunRepository),
      },
      {
        provide: ListUnitTestRunsByRepoUseCase,
        useValue: new ListUnitTestRunsByRepoUseCase(unitTestRunRepository),
      },
      {
        provide: ListTestCaseResultsByRunUseCase,
        useValue: new ListTestCaseResultsByRunUseCase(testCaseResultRepository),
      },
      {
        provide: ListGeneratedTestFilesByRunUseCase,
        useValue: new ListGeneratedTestFilesByRunUseCase(generatedTestFileRepository),
      },
      {
        provide: CancelUnitTestRunUseCase,
        useValue: new CancelUnitTestRunUseCase(
          unitTestRunRepository,
          repoRepository,
          unitTestQueueRegistry,
        ),
      },
    ],
  }).compile();

  return {
    controller: moduleRef.get(UnitTestController),
    repo,
    testCaseResultRepository,
    generatedTestFileRepository,
    unitTestQueue,
  };
}

describe('UnitTestController', () => {
  it('creates a run and then fetches it by id', async () => {
    const { controller, repo } = await buildTestingModule();

    const created = await controller.create('org_1', {
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
    });
    const fetched = await controller.getById('org_1', created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe('queued');
    expect(fetched.generator).toBe('gemini'); // defaults when omitted (docs/adr/0026)
  });

  it('honors an explicit script-generator choice instead of defaulting to gemini', async () => {
    const { controller, repo } = await buildTestingModule();

    const created = await controller.create('org_1', {
      repoId: repo.id,
      target: { path: 'src/foo.ts' },
      generator: 'script',
    });

    expect(created.generator).toBe('script');
  });

  it('translates RepoNotFoundError into a 404', async () => {
    const { controller } = await buildTestingModule();
    await expect(
      controller.create('org_1', { repoId: 'does-not-exist', target: { path: 'x.ts' } }),
    ).rejects.toThrow(NotFoundException);
  });

  it('translates UnitTestRunNotFoundError into a 404', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.getById('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('lists runs for a repo, newest first', async () => {
    const { controller, repo } = await buildTestingModule();
    const r1 = await controller.create('org_1', { repoId: repo.id, target: { path: 'a.ts' } });
    await new Promise((r) => setTimeout(r, 2));
    const r2 = await controller.create('org_1', { repoId: repo.id, target: { path: 'b.ts' } });

    const result = await controller.list('org_1', { repoId: repo.id, page: 1, pageSize: 25 });
    expect(result.data.map((r: { id: string }) => r.id)).toEqual([r2.id, r1.id]);
  });

  it('cancels a queued run', async () => {
    const { controller, repo, unitTestQueue } = await buildTestingModule();
    const run = await controller.create('org_1', { repoId: repo.id, target: { path: 'a.ts' } });

    const cancelled = await controller.cancel('org_1', run.id);

    expect(cancelled.status).toBe('cancelled');
    expect(unitTestQueue.cancelled).toContain(run.id);
  });

  it('returns generated files and results, empty until a run actually processes them', async () => {
    const { controller, repo } = await buildTestingModule();
    const run = await controller.create('org_1', { repoId: repo.id, target: { path: 'a.ts' } });

    expect(await controller.getGeneratedFiles(run.id)).toEqual([]);
    expect(await controller.getResults(run.id)).toEqual([]);
  });
});
