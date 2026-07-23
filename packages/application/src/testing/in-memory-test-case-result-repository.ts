import { randomUUID } from 'node:crypto';
import type { TestCaseResult, TestCaseResultRepository } from '@cqp/core';

export class InMemoryTestCaseResultRepository implements TestCaseResultRepository {
  private readonly results: TestCaseResult[] = [];

  async saveMany(
    runId: string,
    results: Omit<TestCaseResult, 'id' | 'runId'>[],
  ): Promise<TestCaseResult[]> {
    const saved = results.map((result) => ({ ...result, id: randomUUID(), runId }));
    this.results.push(...saved);
    return saved;
  }

  async listByRun(runId: string): Promise<TestCaseResult[]> {
    return this.results.filter((r) => r.runId === runId);
  }
}
