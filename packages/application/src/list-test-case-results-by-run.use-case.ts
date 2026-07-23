import type { TestCaseResult, TestCaseResultRepository } from '@cqp/core';

export class ListTestCaseResultsByRunUseCase {
  constructor(private readonly testCaseResultRepository: TestCaseResultRepository) {}

  async execute(runId: string): Promise<TestCaseResult[]> {
    return this.testCaseResultRepository.listByRun(runId);
  }
}
