import type { QaAutomationReportFormat } from '@cqp/core';
import type { QaAutomationReportGenerator } from './qa-automation-generator.js';
import { PdfQaAutomationReportGenerator } from './generators/qa-automation-pdf-generator.js';

export * from './generators/qa-automation-pdf-generator.js';

const generators: Record<QaAutomationReportFormat, QaAutomationReportGenerator> = {
  pdf: new PdfQaAutomationReportGenerator(),
};

export function getQaAutomationReportGenerator(
  format: QaAutomationReportFormat,
): QaAutomationReportGenerator {
  return generators[format];
}
