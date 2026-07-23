import type { Finding, Severity } from '@cqp/core';
import type { ReportGenerator } from '../generator.js';
import type { ReportModel } from '../report-model.js';

type SarifLevel = 'error' | 'warning' | 'note';

/** SARIF has no direct equivalent of `info`/`low` vs `medium` — collapse to its 3-level scale. */
const SARIF_LEVEL: Record<Severity, SarifLevel> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

function toResult(finding: Finding) {
  return {
    ruleId: finding.ruleId,
    level: SARIF_LEVEL[finding.severity],
    message: { text: finding.title },
    locations: finding.locations.map((location) => ({
      physicalLocation: {
        artifactLocation: { uri: location.filePath },
        region: {
          startLine: location.startLine,
          ...(location.endLine !== undefined ? { endLine: location.endLine } : {}),
          ...(location.startColumn !== undefined ? { startColumn: location.startColumn } : {}),
          ...(location.endColumn !== undefined ? { endColumn: location.endColumn } : {}),
        },
      },
    })),
  };
}

function uniqueRules(findings: Finding[]) {
  const byId = new Map<string, Finding>();
  for (const finding of findings) {
    if (!byId.has(finding.ruleId)) {
      byId.set(finding.ruleId, finding);
    }
  }
  return [...byId.values()].map((finding) => ({
    id: finding.ruleId,
    shortDescription: { text: finding.title },
    ...(finding.cwe !== undefined
      ? { properties: { tags: [finding.cwe, finding.category] } }
      : { properties: { tags: [finding.category] } }),
  }));
}

/** Real SARIF v2.1.0 — see docs/adr/0019. This is the CI-consumable format (ADR-0016). */
export class SarifReportGenerator implements ReportGenerator {
  readonly format = 'sarif' as const;

  async generate(model: ReportModel): Promise<string> {
    const sarif = {
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'CuratalIT Code Quality Platform',
              informationUri: 'https://github.com/curatalit/code-quality-platform',
              rules: uniqueRules(model.findings),
            },
          },
          results: model.findings.map(toResult),
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }
}
