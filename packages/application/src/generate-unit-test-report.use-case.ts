import type {
  GeneratedTestFileRepository,
  ObjectStorage,
  TestCaseResultRepository,
  UnitTestReport,
  UnitTestReportFormat,
  UnitTestReportRepository,
} from '@cqp/core';
import { buildUnitTestReportModel, getUnitTestReportGenerator } from '@cqp/reporting';
import { GetUnitTestRunUseCase } from './get-unit-test-run.use-case.js';

/**
 * Mirrors GenerateReportUseCase exactly (docs/adr/0019), for UnitTestRun
 * instead of Scan — see docs/adr/0024's follow-up: unit test results
 * needed to become downloadable/shareable the same way scan reports
 * already are, for attaching to a PR/code submission.
 */
export class GenerateUnitTestReportUseCase {
  constructor(
    private readonly getUnitTestRunUseCase: GetUnitTestRunUseCase,
    private readonly generatedTestFileRepository: GeneratedTestFileRepository,
    private readonly testCaseResultRepository: TestCaseResultRepository,
    private readonly unitTestReportRepository: UnitTestReportRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(
    orgId: string,
    unitTestRunId: string,
    format: UnitTestReportFormat,
  ): Promise<UnitTestReport> {
    const run = await this.getUnitTestRunUseCase.execute(orgId, unitTestRunId);
    const generatedFiles = await this.generatedTestFileRepository.listByRun(unitTestRunId);
    const results = await this.testCaseResultRepository.listByRun(unitTestRunId);

    const model = buildUnitTestReportModel(run, generatedFiles, results);
    const generator = getUnitTestReportGenerator(format);
    const content = await generator.generate(model);

    const storageKey = `unit-test-reports/${orgId}/${unitTestRunId}/${format}.${format}`;
    await this.objectStorage.put(storageKey, content);

    return this.unitTestReportRepository.create({ orgId, unitTestRunId, format, storageKey });
  }
}
