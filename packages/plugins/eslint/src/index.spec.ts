import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { EslintPlugin } from './index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function makeContext(overrides: Partial<PluginContext['target']> = {}): PluginContext {
  return {
    scanId: 'scan_test',
    orgId: 'org_test',
    repoId: 'repo_test',
    target: { repoRoot: fixturesDir, ...overrides },
    timeoutMs: 30_000,
  };
}

describe('EslintPlugin', () => {
  it('finds no-unused-vars and no-undef in the fixture, but not a false-positive on Node globals', async () => {
    const plugin = new EslintPlugin();
    const findings = await plugin.run(makeContext());

    const ruleIds = findings.map((f) => f.ruleId);
    // typescript-eslint's recommended config swaps in its own
    // no-unused-vars variant even for plain .js files — real, correct
    // tool behavior, not something to work around.
    expect(ruleIds).toContain('@typescript-eslint/no-unused-vars');
    expect(ruleIds).toContain('no-undef');
    // `module` (a Node global) must never be flagged — see baseline-config.ts.
    expect(findings.some((f) => f.riskDescription.includes("'module'"))).toBe(false);

    const unusedVarFinding = findings.find((f) => f.ruleId === '@typescript-eslint/no-unused-vars');
    expect(unusedVarFinding?.source).toBe('eslint');
    expect(unusedVarFinding?.category).toBe('code-quality');
    expect(unusedVarFinding?.confidence).toBe('high');
    expect(unusedVarFinding?.locations[0]?.filePath).toBe('bad.js');
  });

  it('returns no findings for an incremental scan whose changed files are all non-JS/TS', async () => {
    const plugin = new EslintPlugin();
    const findings = await plugin.run(makeContext({ changedFiles: ['README.md'] }));

    expect(findings).toEqual([]);
  });
});
