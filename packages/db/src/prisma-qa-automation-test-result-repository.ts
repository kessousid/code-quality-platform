import type { PrismaClient } from '@prisma/client';
import type {
  CreateQaAutomationTestResultInput,
  QaAutomationTestResult,
  QaAutomationTestResultRepository,
} from '@cqp/core';

/**
 * Infrastructure adapter (ADR-0010) implementing the domain port from
 * @cqp/core against the real generated Prisma client (see docs/adr/0035).
 */
export class PrismaQaAutomationTestResultRepository implements QaAutomationTestResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateQaAutomationTestResultInput): Promise<QaAutomationTestResult> {
    const row = await this.prisma.qaAutomationTestResult.create({
      data: {
        runId: input.runId,
        testId: input.testId,
        testName: input.testName,
        passed: input.passed,
        details: input.details,
      },
    });
    return row;
  }

  async listByRun(runId: string): Promise<QaAutomationTestResult[]> {
    return this.prisma.qaAutomationTestResult.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
