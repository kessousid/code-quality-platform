import type { CoverageReportFormat } from '@cqp/core';
import type { CoverageReportGenerator } from './coverage-generator.js';
import { JsonCoverageReportGenerator } from './generators/coverage-json-generator.js';
import { HtmlCoverageReportGenerator } from './generators/coverage-html-generator.js';
import { PdfCoverageReportGenerator } from './generators/coverage-pdf-generator.js';

export * from './generators/coverage-json-generator.js';
export * from './generators/coverage-html-generator.js';
export * from './generators/coverage-pdf-generator.js';

const generators: Record<CoverageReportFormat, CoverageReportGenerator> = {
  json: new JsonCoverageReportGenerator(),
  html: new HtmlCoverageReportGenerator(),
  pdf: new PdfCoverageReportGenerator(),
};

export function getCoverageReportGenerator(format: CoverageReportFormat): CoverageReportGenerator {
  return generators[format];
}
