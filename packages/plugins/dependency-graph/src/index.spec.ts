import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { DependencyGraphPlugin } from './index.js';

/** No mocking — runs real madge against a fixture with a genuine a.js <-> b.js circular require(). */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function makeContext(): PluginContext {
  return {
    scanId: 'scan_test',
    orgId: 'org_test',
    repoId: 'repo_test',
    target: { repoRoot: fixturesDir },
    timeoutMs: 30_000,
  };
}

describe('DependencyGraphPlugin', () => {
  it('finds the deliberate a.js <-> b.js circular dependency', async () => {
    const plugin = new DependencyGraphPlugin();
    const findings = await plugin.run(makeContext());

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;

    expect(finding.source).toBe('dependency-graph');
    expect(finding.category).toBe('architecture');
    expect(finding.ruleId).toBe('circular-dependency');
    const filePaths = finding.locations.map((l) => l.filePath).sort();
    expect(filePaths).toEqual(['a.js', 'b.js']);
  }, 20_000);
});
