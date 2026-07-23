import { randomUUID } from 'node:crypto';
import type { CoverageFileResult, CoverageFileResultRepository } from '@cqp/core';

export class InMemoryCoverageFileResultRepository implements CoverageFileResultRepository {
  private readonly results: CoverageFileResult[] = [];

  async saveMany(
    runId: string,
    results: Omit<CoverageFileResult, 'id' | 'runId'>[],
  ): Promise<CoverageFileResult[]> {
    const saved = results.map((result) => ({ ...result, id: randomUUID(), runId }));
    this.results.push(...saved);
    return saved;
  }

  async listByRun(runId: string): Promise<CoverageFileResult[]> {
    return this.results.filter((r) => r.runId === runId);
  }
}
