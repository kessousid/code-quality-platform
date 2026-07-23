import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { SemgrepPlugin } from './index.js';

/**
 * No mocking — this shells out to the real `semgrep` binary (resolved via
 * PATH or CQP_SEMGREP_PATH, see docs/adr/0017) against a checked-in
 * fixture with a deliberate `eval()` vulnerability. If semgrep isn't
 * installed where this runs, this test fails loudly rather than silently
 * passing on a mock.
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function makeContext(): PluginContext {
  return {
    scanId: 'scan_test',
    orgId: 'org_test',
    repoId: 'repo_test',
    target: { repoRoot: fixturesDir },
    timeoutMs: 60_000,
  };
}

describe('SemgrepPlugin', () => {
  it('finds the deliberate eval() vulnerability in the fixture and normalizes it into a Finding', async () => {
    const plugin = new SemgrepPlugin();
    const findings = await plugin.run(makeContext());

    const evalFinding = findings.find((f) => f.ruleId.includes('eval-detected'));
    expect(evalFinding).toBeDefined();
    expect(evalFinding?.source).toBe('semgrep');
    expect(evalFinding?.locations[0]?.filePath).toBe('vuln.js');
    expect(evalFinding?.locations[0]?.startLine).toBe(6);
    expect(evalFinding?.severity).toMatch(/^(low|medium|high)$/);
    expect(evalFinding?.cwe).toContain('CWE-95');
    expect(evalFinding?.status).toBe('open');
    expect(evalFinding?.firstSeenScanId).toBe('scan_test');
    expect(evalFinding?.orgId).toBe('org_test');
    expect(evalFinding?.repoId).toBe('repo_test');
  }, 60_000);
});
