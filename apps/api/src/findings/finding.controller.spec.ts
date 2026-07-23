import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@cqp/core';
import { GetFindingUseCase, ListFindingsUseCase } from '@cqp/application';
import { InMemoryFindingRepository } from '@cqp/application/testing';
import { FindingController } from './finding.controller.js';

function makeFinding(overrides: Partial<Finding> & { id: string }): Finding {
  return {
    scanId: 'scan_1',
    orgId: 'org_1',
    repoId: 'repo_1',
    category: 'security',
    source: 'semgrep',
    ruleId: 'rule',
    title: 'a finding',
    severity: 'high',
    confidence: 'high',
    locations: [],
    rootCause: '',
    riskDescription: '',
    recommendedFix: '',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: 'scan_1',
    lastSeenScanId: 'scan_1',
    status: 'open',
    ...overrides,
  };
}

async function buildTestingModule(seed: Finding[]) {
  const repository = new InMemoryFindingRepository();
  seed.forEach((f) => repository.seed(f));

  const moduleRef = await Test.createTestingModule({
    controllers: [FindingController],
    providers: [
      { provide: ListFindingsUseCase, useValue: new ListFindingsUseCase(repository) },
      { provide: GetFindingUseCase, useValue: new GetFindingUseCase(repository) },
    ],
  }).compile();

  return moduleRef.get(FindingController);
}

describe('FindingController', () => {
  it('lists only findings for the current org', async () => {
    const controller = await buildTestingModule([
      makeFinding({ id: 'f1', orgId: 'org_1' }),
      makeFinding({ id: 'f2', orgId: 'org_2' }),
    ]);

    const result = await controller.list('org_1', { page: 1, pageSize: 25 });

    expect(result.data.map((f) => f.id)).toEqual(['f1']);
    expect(result.total).toBe(1);
  });

  it('filters by severity', async () => {
    const controller = await buildTestingModule([
      makeFinding({ id: 'critical-1', severity: 'critical' }),
      makeFinding({ id: 'low-1', severity: 'low' }),
    ]);

    const result = await controller.list('org_1', {
      page: 1,
      pageSize: 25,
      severity: 'critical',
    });

    expect(result.data.map((f) => f.id)).toEqual(['critical-1']);
  });

  it('gets a finding by id, 404s for an unknown one', async () => {
    const controller = await buildTestingModule([makeFinding({ id: 'f1' })]);

    const found = await controller.getById('org_1', 'f1');
    expect(found.id).toBe('f1');

    await expect(controller.getById('org_1', 'does-not-exist')).rejects.toThrow(NotFoundException);
  });
});
