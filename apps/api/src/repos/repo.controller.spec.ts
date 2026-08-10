import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  CreateRepoUseCase,
  GetRepoUseCase,
  ListReposUseCase,
  UpdateRepoAccessTokenUseCase,
} from '@cqp/application';
import { InMemoryRepoRepository } from '@cqp/application/testing';
import { RepoController } from './repo.controller.js';

const REPO_TOKEN_KEY = randomBytes(32);

async function buildTestingModule() {
  const repository = new InMemoryRepoRepository();
  const moduleRef = await Test.createTestingModule({
    controllers: [RepoController],
    providers: [
      {
        provide: CreateRepoUseCase,
        useValue: new CreateRepoUseCase(repository, REPO_TOKEN_KEY),
      },
      { provide: GetRepoUseCase, useValue: new GetRepoUseCase(repository) },
      { provide: ListReposUseCase, useValue: new ListReposUseCase(repository) },
      {
        provide: UpdateRepoAccessTokenUseCase,
        useValue: new UpdateRepoAccessTokenUseCase(repository, REPO_TOKEN_KEY),
      },
    ],
  }).compile();

  return moduleRef.get(RepoController);
}

describe('RepoController', () => {
  it('creates a repo scoped to the current org, then fetches it by id', async () => {
    const controller = await buildTestingModule();

    const created = await controller.create('org_1', { name: 'demo-repo' });
    const fetched = await controller.getById('org_1', created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.orgId).toBe('org_1');
  });

  it('does not leak a repo across orgs', async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', { name: 'demo-repo' });

    await expect(controller.getById('org_2', created.id)).rejects.toThrow(NotFoundException);
  });

  it('paginates the list endpoint', async () => {
    const controller = await buildTestingModule();
    await controller.create('org_1', { name: 'repo-a' });
    await controller.create('org_1', { name: 'repo-b' });
    await controller.create('org_1', { name: 'repo-c' });

    const page1 = await controller.list('org_1', { page: 1, pageSize: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);
  });

  it("defaults a repo's workerId to 'default' when omitted (docs/adr/0031)", async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', { name: 'demo-repo' });

    expect(created.workerId).toBe('default');
  });

  it('honors an explicit workerId instead of defaulting', async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', {
      name: 'laptop-repo',
      workerId: 'keshav-laptop',
    });

    expect(created.workerId).toBe('keshav-laptop');
  });

  it('never returns encryptedAccessToken on create, get, or list (docs/adr/0047)', async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', {
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
      accessToken: 'ghp_realtoken',
    });

    expect(created).not.toHaveProperty('encryptedAccessToken');

    const fetched = await controller.getById('org_1', created.id);
    expect(fetched).not.toHaveProperty('encryptedAccessToken');

    const list = await controller.list('org_1', { page: 1, pageSize: 10 });
    expect(list.data.every((r) => !('encryptedAccessToken' in r))).toBe(true);
  });

  it('rotates an access token via PUT /repos/:id/access-token', async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', {
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
    });

    const updated = await controller.updateAccessToken('org_1', created.id, {
      accessToken: 'ghp_newtoken',
    });

    expect(updated).not.toHaveProperty('encryptedAccessToken');
  });

  it('404s when rotating an access token for a repo in another org', async () => {
    const controller = await buildTestingModule();
    const created = await controller.create('org_1', { name: 'demo-repo' });

    await expect(
      controller.updateAccessToken('org_2', created.id, { accessToken: 'ghp_x' }),
    ).rejects.toThrow(NotFoundException);
  });
});
