import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { OsvScannerPlugin } from './index.js';

/**
 * No mocking — shells out to the real `osv-scanner` binary against a
 * checked-in fixture `package-lock.json` pinning `lodash@4.17.15` and
 * `minimist@1.2.5`, both real, known-vulnerable versions with public
 * advisories.
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

describe('OsvScannerPlugin', () => {
  it('finds real advisories for the pinned vulnerable lodash and minimist versions', async () => {
    const plugin = new OsvScannerPlugin();
    const findings = await plugin.run(makeContext());

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.source === 'osv-scanner')).toBe(true);
    expect(findings.every((f) => f.category === 'dependency-vulnerability')).toBe(true);
    expect(findings.every((f) => f.confidence === 'high')).toBe(true);

    const packageNames = findings.map((f) => f.title);
    expect(packageNames.some((t) => t.startsWith('lodash@'))).toBe(true);
    expect(packageNames.some((t) => t.startsWith('minimist@'))).toBe(true);

    const lodashFinding = findings.find((f) => f.title.startsWith('lodash@'));
    expect(lodashFinding?.recommendedFix).toContain('Upgrade lodash');
    expect(lodashFinding?.locations[0]?.filePath).toBe('package-lock.json');
  }, 30_000);
});
