import type { PrismaClient } from '@prisma/client';
import type { TestCaseResult, TestCaseResultRepository } from '@cqp/core';
import { testCaseStatusFromDb, testCaseStatusToDb } from './mappers.js';

export class PrismaTestCaseResultRepository implements TestCaseResultRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMany(
    runId: string,
    results: Omit<TestCaseResult, 'id' | 'runId'>[],
  ): Promise<TestCaseResult[]> {
    if (results.length === 0) return [];
    await this.prisma.testCaseResult.createMany({
      data: results.map((result) => ({
        runId,
        testFilePath: result.testFilePath,
        testName: result.testName,
        status: testCaseStatusToDb(result.status),
        durationMs: result.durationMs ?? null,
        failureMessage: result.failureMessage ?? null,
      })),
    });
    return this.listByRun(runId);
  }

  async listByRun(runId: string): Promise<TestCaseResult[]> {
    const rows = await this.prisma.testCaseResult.findMany({
      where: { runId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      testFilePath: row.testFilePath,
      testName: row.testName,
      status: testCaseStatusFromDb(row.status),
      ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
      ...(row.failureMessage !== null ? { failureMessage: row.failureMessage } : {}),
    }));
  }
}
