import type { QaAutomationReportFormat } from '@cqp/core';
import type { QaAutomationReportGenerator } from './qa-automation-generator.js';
import { PdfQaAutomationReportGenerator } from './generators/qa-automation-pdf-generator.js';
import { ExcelQaAutomationReportGenerator } from './generators/qa-automation-excel-generator.js';

export * from './generators/qa-automation-pdf-generator.js';
export * from './generators/qa-automation-excel-generator.js';

const generators: Record<QaAutomationReportFormat, QaAutomationReportGenerator> = {
  pdf: new PdfQaAutomationReportGenerator(),
  xlsx: new ExcelQaAutomationReportGenerator(),
};

export function getQaAutomationReportGenerator(
  format: QaAutomationReportFormat,
): QaAutomationReportGenerator {
  return generators[format];
}
