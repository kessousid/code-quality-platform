import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtinPlugins } from './plugin-registry.js';
import { runScan } from './orchestrator.js';

/**
 * The real end-to-end proof for Phase 7: all 6 plugins, dispatched through
 * the actual worker-thread isolation runtime built in Phase 5, against one
 * fixture repo deliberately planted with one issue per category. No
 * mocking anywhere in this chain — every plugin shells out to or invokes
 * the real tool. Requires CQP_GITLEAKS_PATH/CQP_OSV_SCANNER_PATH to be set
 * to this sandbox's downloaded binaries (see docs/architecture/local-tool-setup.md);
 * Semgrep and Node-native tools (ESLint/jscpd/madge) resolve automatically.
 */
const sampleRepoRoot = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'sample-repo');

describe('full scan integration', () => {
  it('runs all 6 plugins via real worker-thread isolation and finds the deliberate issue in each category', async () => {
    const { findings, pluginStatuses } = await runScan(
      builtinPlugins,
      {
        scanId: 'scan_test',
        orgId: 'org_test',
        repoId: 'repo_test',
        target: { repoRoot: sampleRepoRoot },
      },
      { timeoutMsPerPlugin: 90_000 },
    );

    // Every plugin should have run to completion — if this fails, check
    // pluginStatuses for which one errored/timed out and why.
    const failed = pluginStatuses.filter((s) => s.status !== 'success');
    expect(failed, JSON.stringify(failed)).toEqual([]);

    const bySource = (source: string) => findings.filter((f) => f.source === source);

    expect(bySource('semgrep').some((f) => f.ruleId.includes('eval-detected'))).toBe(true);
    expect(bySource('gitleaks').some((f) => f.ruleId === 'slack-bot-token')).toBe(true);
    expect(bySource('osv-scanner').some((f) => f.title.startsWith('lodash@'))).toBe(true);
    expect(bySource('eslint').some((f) => f.ruleId === 'no-undef')).toBe(true);
    expect(bySource('jscpd').some((f) => f.ruleId === 'duplicate-code')).toBe(true);
    expect(bySource('dependency-graph').some((f) => f.ruleId === 'circular-dependency')).toBe(true);

    // Every finding, regardless of source, carries the scan/org/repo
    // context stamped by the orchestrator (ADR closing the Phase 7 gap
    // in PluginContext).
    expect(findings.every((f) => f.orgId === 'org_test' && f.repoId === 'repo_test')).toBe(true);
  }, 120_000);
});
