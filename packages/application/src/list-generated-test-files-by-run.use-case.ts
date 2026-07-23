import type { GeneratedTestFile, GeneratedTestFileRepository } from '@cqp/core';

export class ListGeneratedTestFilesByRunUseCase {
  constructor(private readonly generatedTestFileRepository: GeneratedTestFileRepository) {}

  async execute(runId: string): Promise<GeneratedTestFile[]> {
    return this.generatedTestFileRepository.listByRun(runId);
  }
}
