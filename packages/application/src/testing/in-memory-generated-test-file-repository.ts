import { randomUUID } from 'node:crypto';
import type { GeneratedTestFile, GeneratedTestFileRepository } from '@cqp/core';

export class InMemoryGeneratedTestFileRepository implements GeneratedTestFileRepository {
  private readonly files: GeneratedTestFile[] = [];

  async saveMany(
    runId: string,
    files: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[],
  ): Promise<GeneratedTestFile[]> {
    const saved = files.map((file) => ({
      ...file,
      id: randomUUID(),
      runId,
      createdAt: new Date(),
    }));
    this.files.push(...saved);
    return saved;
  }

  async listByRun(runId: string): Promise<GeneratedTestFile[]> {
    return this.files.filter((f) => f.runId === runId);
  }
}
