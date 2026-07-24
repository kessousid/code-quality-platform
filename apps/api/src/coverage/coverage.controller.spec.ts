import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  CancelCoverageRunUseCase,
  CreateCoverageRunUseCase,
  GetCoverageRunUseCase,
  ListCoverageFileResultsByRunUseCase,
  ListCoverageRunsByRepoUseCase,
} from '@cqp/application';
import {
  InMemoryCoverageFileResultRepository,
  InMemoryCoverageQueueRegistry,
  InMemoryCoverageRunRepository,
  InMemoryRepoRepository,
} from '@cqp/application/testing';
import { CoverageController } from './coverage.controller.js';

/** docs/adr/0031: baseRef is no longer validated at creation time (it happens on the worker instead), so this no longer needs a real git repo. */
describe('CoverageController', () => {
  async function buildTestingModule() {
    const coverageRunRepository = new InMemoryCoverageRunRepository();
    const repoRepository = new InMemoryRepoRepository();
    const coverageFileResultRepository = new InMemoryCoverageFileResultRepository();
    const coverageQueueRegistry = new InMemoryCoverageQueueRegistry();
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'demo-repo',
      localPath: '/repo',
      defaultBranch: 'main',
    });
    const coverageQueue = coverageQueueRegistry.forWorker(repo.workerId);

    const moduleRef = await Test.createTestingModule({
      controllers: [CoverageController],
      providers: [
        {
          provide: CreateCoverageRunUseCase,
          useValue: new CreateCoverageRunUseCase(
            coverageRunRepository,
            repoRepository,
            coverageQueueRegistry,
          ),
        },
        {
          provide: GetCoverageRunUseCase,
          useValue: new GetCoverageRunUseCase(coverageRunRepository),
        },
        {
          provide: ListCoverageRunsByRepoUseCase,
          useValue: new ListCoverageRunsByRepoUseCase(coverageRunRepository),
        },
        {
          provide: ListCoverageFileResultsByRunUseCase,
          useValue: new ListCoverageFileResultsByRunUseCase(coverageFileResultRepository),
        },
        {
          provide: CancelCoverageRunUseCase,
          useValue: new CancelCoverageRunUseCase(
            coverageRunRepository,
            repoRepository,
            coverageQueueRegistry,
          ),
        },
      ],
    }).compile();

    return {
      controller: moduleRef.get(CoverageController),
      repo,
      coverageFileResultRepository,
      coverageQueue,
    };
  }

  it('creates a run (resolving baseRef to defaultBranch) and then fetches it by id', async () => {
    const { controller, repo } = await buildTestingModule();

    const created = await controller.create('org_1', { repoId: repo.id });
    const fetched = await controller.getById('org_1', created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe('queued');
    expect(fetched.baseRef).toBe('main');
  });

  it('translates RepoNotFoundError into a 404', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.create('org_1', { repoId: 'does-not-exist' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('translates CoverageRunNotFoundError into a 404', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.getById('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('lists runs for a repo, newest first', async () => {
    const { controller, repo } = await buildTestingModule();
    const r1 = await controller.create('org_1', { repoId: repo.id });
    await new Promise((r) => setTimeout(r, 2));
    const r2 = await controller.create('org_1', { repoId: repo.id });

    const result = await controller.list('org_1', { repoId: repo.id, page: 1, pageSize: 25 });
    expect(result.data.map((r: { id: string }) => r.id)).toEqual([r2.id, r1.id]);
  });

  it('cancels a queued run', async () => {
    const { controller, repo, coverageQueue } = await buildTestingModule();
    const run = await controller.create('org_1', { repoId: repo.id });

    const cancelled = await controller.cancel('org_1', run.id);

    expect(cancelled.status).toBe('cancelled');
    expect(coverageQueue.cancelled).toContain(run.id);
  });

  it('returns file results, empty until a run actually processes them', async () => {
    const { controller, repo } = await buildTestingModule();
    const run = await controller.create('org_1', { repoId: repo.id });

    expect(await controller.getResults(run.id)).toEqual([]);
  });
});
