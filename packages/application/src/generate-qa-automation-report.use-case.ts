import type {
  ObjectStorage,
  QaAutomationReport,
  QaAutomationReportFormat,
  QaAutomationReportRepository,
} from '@cqp/core';
import { buildQaAutomationReportModel, getQaAutomationReportGenerator } from '@cqp/reporting';
import { GetQaAutomationRunUseCase } from './get-qa-automation-run.use-case.js';

/**
 * Mirrors GenerateUnitTestReportUseCase, for QaAutomationRun instead of
 * UnitTestRun — reuses GetQaAutomationRunUseCase (already fetches the run
 * with its results together) rather than fetching them separately.
 */
export class GenerateQaAutomationReportUseCase {
  constructor(
    private readonly getQaAutomationRunUseCase: GetQaAutomationRunUseCase,
    private readonly qaAutomationReportRepository: QaAutomationReportRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(
    orgId: string,
    runId: string,
    format: QaAutomationReportFormat,
  ): Promise<QaAutomationReport> {
    const { results, ...run } = await this.getQaAutomationRunUseCase.execute(orgId, runId);

    const model = buildQaAutomationReportModel(run, results);
    const generator = getQaAutomationReportGenerator(format);
    const content = await generator.generate(model);

    const storageKey = `qa-automation-reports/${orgId}/${runId}/${format}.${format}`;
    await this.objectStorage.put(storageKey, content);

    return this.qaAutomationReportRepository.create({ orgId, runId, format, storageKey });
  }
}
