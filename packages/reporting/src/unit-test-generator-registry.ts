import type { UnitTestReportFormat } from '@cqp/core';
import type { UnitTestReportGenerator } from './unit-test-generator.js';
import { JsonUnitTestReportGenerator } from './generators/unit-test-json-generator.js';
import { HtmlUnitTestReportGenerator } from './generators/unit-test-html-generator.js';
import { PdfUnitTestReportGenerator } from './generators/unit-test-pdf-generator.js';

export * from './generators/unit-test-json-generator.js';
export * from './generators/unit-test-html-generator.js';
export * from './generators/unit-test-pdf-generator.js';

const generators: Record<UnitTestReportFormat, UnitTestReportGenerator> = {
  json: new JsonUnitTestReportGenerator(),
  html: new HtmlUnitTestReportGenerator(),
  pdf: new PdfUnitTestReportGenerator(),
};

export function getUnitTestReportGenerator(format: UnitTestReportFormat): UnitTestReportGenerator {
  return generators[format];
}
