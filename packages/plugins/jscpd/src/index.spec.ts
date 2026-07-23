import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { JscpdPlugin } from './index.js';

/** No mocking — shells out to the real jscpd binary against two near-identical fixture files. */
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

describe('JscpdPlugin', () => {
  it('finds the deliberate duplication between a.js and b.js', async () => {
    const plugin = new JscpdPlugin();
    const findings = await plugin.run(makeContext());

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;

    expect(finding.source).toBe('jscpd');
    expect(finding.category).toBe('code-quality');
    expect(finding.confidence).toBe('high');
    const filePaths = finding.locations.map((l) => l.filePath).sort();
    expect(filePaths).toEqual(['a.js', 'b.js']);
  }, 20_000);
});
