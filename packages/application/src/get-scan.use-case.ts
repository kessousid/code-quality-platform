import type { Scan, ScanRepository } from '@cqp/core';

export class ScanNotFoundError extends Error {
  constructor(scanId: string) {
    super(`Scan not found: ${scanId}`);
    this.name = 'ScanNotFoundError';
  }
}

export class GetScanUseCase {
  constructor(private readonly scanRepository: ScanRepository) {}

  async execute(orgId: string, scanId: string): Promise<Scan> {
    const scan = await this.scanRepository.findById(orgId, scanId);
    if (!scan) {
      throw new ScanNotFoundError(scanId);
    }
    return scan;
  }
}
