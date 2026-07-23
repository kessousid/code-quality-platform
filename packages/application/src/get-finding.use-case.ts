import type { Finding, FindingRepository } from '@cqp/core';

export class FindingNotFoundError extends Error {
  constructor(findingId: string) {
    super(`Finding not found: ${findingId}`);
    this.name = 'FindingNotFoundError';
  }
}

export class GetFindingUseCase {
  constructor(private readonly findingRepository: FindingRepository) {}

  async execute(orgId: string, findingId: string): Promise<Finding> {
    const finding = await this.findingRepository.findById(orgId, findingId);
    if (!finding) {
      throw new FindingNotFoundError(findingId);
    }
    return finding;
  }
}
