import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import type { Finding, PluginContext, Severity } from '@cqp/core';
import type {
  OsvOutput,
  OsvPackageGroup,
  OsvResult,
  OsvScannedPackage,
  OsvVulnerability,
} from './osv-output.js';

function severityFromDatabaseSpecific(
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | undefined,
): Severity | undefined {
  switch (severity) {
    case 'LOW':
      return 'low';
    case 'MODERATE':
      return 'medium';
    case 'HIGH':
      return 'high';
    case 'CRITICAL':
      return 'critical';
    default:
      return undefined;
  }
}

/** Standard CVSS 3.x severity bands, used when database_specific.severity is absent. */
function severityFromCvssScore(score: string | undefined): Severity {
  const numeric = parseFloat(score ?? '');
  if (Number.isNaN(numeric)) return 'medium';
  if (numeric >= 9) return 'critical';
  if (numeric >= 7) return 'high';
  if (numeric >= 4) return 'medium';
  return 'low';
}

function findFixedVersion(vuln: OsvVulnerability, packageName: string): string | undefined {
  const affected = vuln.affected?.find((a) => a.package.name === packageName);
  for (const range of affected?.ranges ?? []) {
    const fixedEvent = range.events.find((event) => event.fixed !== undefined);
    if (fixedEvent?.fixed) return fixedEvent.fixed;
  }
  return undefined;
}

/**
 * One Finding per `group`, not per raw `vulnerabilities[]` entry — groups
 * dedupe aliases (a GHSA id and its CVE alias are the same underlying
 * advisory from OSV-Scanner's perspective) so this is the right unit for
 * "one issue," matching how a human would read the CLI's own output.
 */
function mapOsvGroup(
  result: OsvResult,
  pkg: OsvScannedPackage,
  group: OsvPackageGroup,
  context: PluginContext,
): Finding | null {
  const vuln = pkg.vulnerabilities.find((v) => group.ids.includes(v.id));
  if (!vuln) return null;

  const severity =
    severityFromDatabaseSpecific(vuln.database_specific?.severity) ??
    severityFromCvssScore(group.max_severity);
  const fixedVersion = findFixedVersion(vuln, pkg.package.name);

  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category: 'dependency-vulnerability',
    source: 'osv-scanner',
    ruleId: vuln.id,
    title: `${pkg.package.name}@${pkg.package.version}: ${vuln.summary ?? vuln.id}`,
    severity,
    // OSV entries are curated, published advisories, not heuristic pattern
    // matches — there is no equivalent of a "might be a false positive" axis.
    confidence: 'high',
    locations: [
      {
        filePath: relative(context.target.repoRoot, result.source.path).replace(/\\/g, '/'),
        startLine: 1,
      },
    ],
    rootCause: `${pkg.package.name}@${pkg.package.version} is affected by ${vuln.id}`,
    riskDescription: vuln.summary ?? vuln.details ?? `See ${vuln.id} for details.`,
    recommendedFix: fixedVersion
      ? `Upgrade ${pkg.package.name} to ${fixedVersion} or later.`
      : `Check ${vuln.id} for a fixed version of ${pkg.package.name}.`,
    references: (vuln.references ?? []).map((ref) => ({ title: ref.type, url: ref.url })),
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
    ...(vuln.database_specific?.cwe_ids?.[0] !== undefined
      ? { cwe: vuln.database_specific.cwe_ids[0] }
      : {}),
  };
}

export function mapOsvOutput(output: OsvOutput, context: PluginContext): Finding[] {
  const findings: Finding[] = [];
  for (const result of output.results) {
    for (const pkg of result.packages) {
      for (const group of pkg.groups) {
        const finding = mapOsvGroup(result, pkg, group, context);
        if (finding) findings.push(finding);
      }
    }
  }
  return findings;
}
