import type { ReportFormat } from '@cqp/core';
import type { ReportGenerator } from './generator.js';
import { JsonReportGenerator } from './generators/json-generator.js';
import { SarifReportGenerator } from './generators/sarif-generator.js';
import { HtmlReportGenerator } from './generators/html-generator.js';
import { PdfReportGenerator } from './generators/pdf-generator.js';

export * from './generators/json-generator.js';
export * from './generators/sarif-generator.js';
export * from './generators/html-generator.js';
export * from './generators/pdf-generator.js';

const generators: Record<ReportFormat, ReportGenerator> = {
  json: new JsonReportGenerator(),
  sarif: new SarifReportGenerator(),
  html: new HtmlReportGenerator(),
  pdf: new PdfReportGenerator(),
};

export function getReportGenerator(format: ReportFormat): ReportGenerator {
  return generators[format];
}
