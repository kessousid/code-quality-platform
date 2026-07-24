import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  CancelScanUseCase,
  CreateScanUseCase,
  GetScanSummaryUseCase,
  GetScanUseCase,
  ListFindingsByScanUseCase,
  ListScansByRepoUseCase,
} from '@cqp/application';
import {
  InMemoryFindingRepository,
  InMemoryRepoRepository,
  InMemoryScanQueueRegistry,
  InMemoryScanRepository,
} from '@cqp/application/testing';
import { ScanController } from './scan.controller.js';

/**
 * Proves the vertical slice (ADR-0010) end-to-end through real NestJS DI —
 * controller -> use case -> repository port — without touching Prisma or a
 * database. Phase 6: orgId is passed positionally here exactly as
 * @CurrentOrg() would supply it at the HTTP layer (this unit test bypasses
 * the decorator, which only resolves during a real request — see the
 * supertest-based auth e2e test for that path).
 */
async function buildTestingModule() {
  const scanRepository = new InMemoryScanRepository();
  const repoRepository = new InMemoryRepoRepository();
  const findingRepository = new InMemoryFindingRepository();
  const scanQueueRegistry = new InMemoryScanQueueRegistry();
  const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo-repo' });
  const scanQueue = scanQueueRegistry.forWorker(repo.workerId);

  const moduleRef = await Test.createTestingModule({
    controllers: [ScanController],
    providers: [
      {
        provide: CreateScanUseCase,
        useValue: new CreateScanUseCase(scanRepository, repoRepository, scanQueueRegistry),
      },
      { provide: GetScanUseCase, useValue: new GetScanUseCase(scanRepository) },
      { provide: ListScansByRepoUseCase, useValue: new ListScansByRepoUseCase(scanRepository) },
      {
        provide: GetScanSummaryUseCase,
        useValue: new GetScanSummaryUseCase(new GetScanUseCase(scanRepository), findingRepository),
      },
      {
        provide: ListFindingsByScanUseCase,
        useValue: new ListFindingsByScanUseCase(findingRepository),
      },
      {
        provide: CancelScanUseCase,
        useValue: new CancelScanUseCase(scanRepository, repoRepository, scanQueueRegistry),
      },
    ],
  }).compile();

  return { controller: moduleRef.get(ScanController), repo, findingRepository, scanQueue };
}

describe('ScanController', () => {
  it('creates a scan and then fetches it by id', async () => {
    const { controller, repo } = await buildTestingModule();

    const created = await controller.create('org_1', {
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    const fetched = await controller.getById('org_1', created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe('queued');
  });

  it('translates ScanNotFoundError into a 404 NotFoundException', async () => {
    const { controller } = await buildTestingModule();

    await expect(controller.getById('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('translates RepoNotFoundError into a 404 NotFoundException when repoId is invalid', async () => {
    const { controller } = await buildTestingModule();

    await expect(
      controller.create('org_1', { repoId: 'does-not-exist', ref: 'main', mode: 'full' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists scans for a repo, newest first', async () => {
    const { controller, repo } = await buildTestingModule();
    const s1 = await controller.create('org_1', { repoId: repo.id, ref: 'main', mode: 'full' });
    await new Promise((r) => setTimeout(r, 2)); // ensure distinct createdAt — see list-scans-by-repo.use-case.spec.ts
    const s2 = await controller.create('org_1', { repoId: repo.id, ref: 'main', mode: 'full' });

    const result = await controller.list('org_1', { repoId: repo.id, page: 1, pageSize: 25 });
    expect(result.data.map((s: { id: string }) => s.id)).toEqual([s2.id, s1.id]);
  });

  it('returns a computed summary for a scan, scoped to its own findings', async () => {
    const { controller, repo, findingRepository } = await buildTestingModule();
    const scan = await controller.create('org_1', { repoId: repo.id, ref: 'main', mode: 'full' });

    findingRepository.seed({
      id: 'f1',
      scanId: scan.id,
      orgId: 'org_1',
      repoId: repo.id,
      category: 'security',
      source: 'semgrep',
      ruleId: 'eval-detected',
      title: 'Use of eval()',
      severity: 'critical',
      confidence: 'high',
      locations: [],
      rootCause: 'x',
      riskDescription: 'y',
      recommendedFix: 'z',
      references: [],
      patchPrConfirmedByUser: false,
      firstSeenScanId: scan.id,
      lastSeenScanId: scan.id,
      status: 'open',
    });

    const summary = await controller.getSummary('org_1', scan.id);
    expect(summary.totalFindings).toBe(1);
    expect(summary.healthScore).toBe(75);

    const findings = await controller.getFindings('org_1', scan.id);
    expect(findings).toHaveLength(1);
  });

  it('404s a summary request for an unknown scan', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.getSummary('org_1', 'does-not-exist')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('cancels a queued scan and removes it from the queue', async () => {
    const { controller, repo, scanQueue } = await buildTestingModule();
    const scan = await controller.create('org_1', { repoId: repo.id, ref: 'main', mode: 'full' });

    const cancelled = await controller.cancel('org_1', scan.id);

    expect(cancelled.status).toBe('cancelled');
    expect(scanQueue.cancelled).toContain(scan.id);
  });

  it('404s a cancel request for an unknown scan', async () => {
    const { controller } = await buildTestingModule();
    await expect(controller.cancel('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });
});
