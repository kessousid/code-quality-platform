import type { PrismaClient } from '@prisma/client';
import type { GeneratedTestFile, GeneratedTestFileRepository } from '@cqp/core';

export class PrismaGeneratedTestFileRepository implements GeneratedTestFileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMany(
    runId: string,
    files: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[],
  ): Promise<GeneratedTestFile[]> {
    if (files.length === 0) return [];
    await this.prisma.generatedTestFile.createMany({
      data: files.map((file) => ({
        runId,
        sourceFilePath: file.sourceFilePath,
        testFilePath: file.testFilePath,
        functionName: file.functionName ?? null,
      })),
    });
    return this.listByRun(runId);
  }

  async listByRun(runId: string): Promise<GeneratedTestFile[]> {
    const rows = await this.prisma.generatedTestFile.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      sourceFilePath: row.sourceFilePath,
      testFilePath: row.testFilePath,
      createdAt: row.createdAt,
      ...(row.functionName !== null ? { functionName: row.functionName } : {}),
    }));
  }
}
