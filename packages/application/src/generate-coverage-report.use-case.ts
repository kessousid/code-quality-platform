import type {
  CoverageFileResultRepository,
  CoverageReport,
  CoverageReportFormat,
  CoverageReportRepository,
  ObjectStorage,
} from '@cqp/core';
import { buildCoverageReportModel, getCoverageReportGenerator } from '@cqp/reporting';
import { GetCoverageRunUseCase } from './get-coverage-run.use-case.js';

/**
 * Mirrors GenerateUnitTestReportUseCase exactly (docs/adr/0019, docs/adr/0024),
 * for CoverageRun instead — docs/adr/0025's follow-up: coverage-gate
 * results needed to become downloadable/shareable the same way unit-test
 * results already are, for attaching to a PR/code submission.
 */
export class GenerateCoverageReportUseCase {
  constructor(
    private readonly getCoverageRunUseCase: GetCoverageRunUseCase,
    private readonly coverageFileResultRepository: CoverageFileResultRepository,
    private readonly coverageReportRepository: CoverageReportRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(
    orgId: string,
    coverageRunId: string,
    format: CoverageReportFormat,
  ): Promise<CoverageReport> {
    const run = await this.getCoverageRunUseCase.execute(orgId, coverageRunId);
    const fileResults = await this.coverageFileResultRepository.listByRun(coverageRunId);

    const model = buildCoverageReportModel(run, fileResults);
    const generator = getCoverageReportGenerator(format);
    const content = await generator.generate(model);

    const storageKey = `coverage-reports/${orgId}/${coverageRunId}/${format}.${format}`;
    await this.objectStorage.put(storageKey, content);

    return this.coverageReportRepository.create({ orgId, coverageRunId, format, storageKey });
  }
}
