import type {
  FindingRepository,
  ObjectStorage,
  Report,
  ReportFormat,
  ReportRepository,
} from '@cqp/core';
import { buildReportModel, getReportGenerator } from '@cqp/reporting';
import { buildEnrichmentsForScan } from '@cqp/enrichment';
import { GetRepoUseCase } from './get-repo.use-case.js';
import { GetScanUseCase } from './get-scan.use-case.js';

/**
 * Ties Phase 6's read-only reporting scaffolding to a real pipeline (see
 * docs/adr/0019): load scan + repo + findings, build the shared model,
 * run it through the format's generator, persist the bytes via
 * `ObjectStorage`, and record the `Report` row. Reuses `GetScanUseCase`/
 * `GetRepoUseCase` rather than re-implementing not-found handling.
 */
export class GenerateReportUseCase {
  constructor(
    private readonly getScanUseCase: GetScanUseCase,
    private readonly getRepoUseCase: GetRepoUseCase,
    private readonly findingRepository: FindingRepository,
    private readonly reportRepository: ReportRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(orgId: string, scanId: string, format: ReportFormat): Promise<Report> {
    const scan = await this.getScanUseCase.execute(orgId, scanId);
    const repo = await this.getRepoUseCase.execute(orgId, scan.repoId);
    const rawFindings = await this.findingRepository.listByScan(orgId, scanId);
    const enrichments = buildEnrichmentsForScan(rawFindings);
    const findings = rawFindings.map((finding) => ({
      ...finding,
      ai: enrichments.get(finding.id)!,
    }));

    const model = buildReportModel(scan, repo, findings);
    const generator = getReportGenerator(format);
    const content = await generator.generate(model);

    const storageKey = `reports/${orgId}/${scanId}/${format}.${format}`;
    await this.objectStorage.put(storageKey, content);

    return this.reportRepository.create({ orgId, scanId, format, storageKey });
  }
}
