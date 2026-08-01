import { randomUUID } from 'node:crypto';
import type {
  CreateQaAutomationTestResultInput,
  QaAutomationTestResult,
  QaAutomationTestResultRepository,
} from '@cqp/core';

export class InMemoryQaAutomationTestResultRepository implements QaAutomationTestResultRepository {
  private readonly results: QaAutomationTestResult[] = [];

  async create(input: CreateQaAutomationTestResultInput): Promise<QaAutomationTestResult> {
    const result: QaAutomationTestResult = {
      id: randomUUID(),
      runId: input.runId,
      testId: input.testId,
      testName: input.testName,
      passed: input.passed,
      details: input.details,
      createdAt: new Date(),
    };
    this.results.push(result);
    return result;
  }

  async listByRun(runId: string): Promise<QaAutomationTestResult[]> {
    return this.results.filter((r) => r.runId === runId);
  }
}
