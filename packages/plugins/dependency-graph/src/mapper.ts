import { randomUUID } from 'node:crypto';
import type { CodeLocation, Finding, PluginContext, Severity } from '@cqp/core';

function severityForCycleLength(cycleLength: number): Severity {
  return cycleLength >= 4 ? 'high' : 'medium';
}

/**
 * madge reports a cycle as an ordered list of file paths already relative
 * to the scanned root — no further path math needed, unlike the
 * subprocess-based plugins which get absolute paths back.
 */
export function mapCircularDependency(cycle: string[], context: PluginContext): Finding {
  const locations: CodeLocation[] = cycle.map((filePath) => ({ filePath, startLine: 1 }));
  const cycleDescription = [...cycle, cycle[0]].join(' → ');

  return {
    id: randomUUID(),
    scanId: context.scanId,
    orgId: context.orgId,
    repoId: context.repoId,
    category: 'architecture',
    source: 'dependency-graph',
    ruleId: 'circular-dependency',
    title: `Circular dependency: ${cycleDescription}`,
    severity: severityForCycleLength(cycle.length),
    confidence: 'high',
    locations,
    rootCause: `${cycle.join(', ')} import each other, forming a cycle.`,
    riskDescription:
      'Circular dependencies make module initialization order unpredictable and can produce partially-undefined exports depending on which module in the cycle loads first.',
    recommendedFix:
      'Break the cycle by extracting the shared code both sides depend on into a separate module, or by inverting one of the dependencies.',
    references: [],
    patchPrConfirmedByUser: false,
    firstSeenScanId: context.scanId,
    lastSeenScanId: context.scanId,
    status: 'open',
  };
}
