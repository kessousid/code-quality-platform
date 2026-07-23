import type { FindingRepository } from '@cqp/core';
import { computeReportSummary, type ReportSummary } from '@cqp/reporting';
import { GetScanUseCase } from './get-scan.use-case.js';

/**
 * Score tiles without generating a full report (Phase 10 dashboard) — a
 * lean read path over the same health-score formula `GenerateReportUseCase`
 * uses, not a duplicate of it. Confirms the scan exists (and belongs to
 * this org) via `GetScanUseCase` before computing.
 */
export class GetScanSummaryUseCase {
  constructor(
    private readonly getScanUseCase: GetScanUseCase,
    private readonly findingRepository: FindingRepository,
  ) {}

  async execute(orgId: string, scanId: string): Promise<ReportSummary> {
    await this.getScanUseCase.execute(orgId, scanId);
    const findings = await this.findingRepository.listByScan(orgId, scanId);
    return computeReportSummary(findings);
  }
}
