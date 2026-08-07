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
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      },
    });
    return this.toDomain(row);
  }

  async listByRun(runId: string): Promise<QaAutomationTestResult[]> {
    const rows = await this.prisma.qaAutomationTestResult.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    runId: string;
    testId: string;
    testName: string;
    passed: boolean;
    details: string;
    sourceUrl: string | null;
    createdAt: Date;
  }): QaAutomationTestResult {
    return {
      id: row.id,
      runId: row.runId,
      testId: row.testId,
      testName: row.testName,
      passed: row.passed,
      details: row.details,
      ...(row.sourceUrl !== null ? { sourceUrl: row.sourceUrl } : {}),
      createdAt: row.createdAt,
    };
  }
}
