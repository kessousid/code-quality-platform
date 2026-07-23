import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@cqp/core';
import { GitleaksPlugin } from './index.js';

/**
 * No mocking — shells out to the real `gitleaks` binary against a
 * checked-in fixture with a deliberate (fake) Slack bot token.
 */
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

describe('GitleaksPlugin', () => {
  it('finds the deliberate fake Slack token and redacts the secret value', async () => {
    const plugin = new GitleaksPlugin();
    const findings = await plugin.run(makeContext());

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;

    expect(finding.source).toBe('gitleaks');
    expect(finding.ruleId).toBe('slack-bot-token');
    expect(finding.category).toBe('secret-detection');
    expect(finding.severity).toBe('critical');
    expect(finding.locations[0]?.filePath).toBe('config.js');
    expect(finding.locations[0]?.startLine).toBe(3);

    // The raw secret must never appear verbatim anywhere on the finding.
    const rawSecret = 'xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx';
    expect(JSON.stringify(finding)).not.toContain(rawSecret);
    expect(finding.exampleCode).toMatch(/^xoxb\*+uvwx$/);
  }, 15_000);
});
