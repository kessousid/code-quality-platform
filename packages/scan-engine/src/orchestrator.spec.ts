import { describe, expect, it } from 'vitest';
import type { ScanTarget } from '@cqp/core';
import type { PluginDescriptor } from './plugin-registry.js';
import { runScan, shouldRunPlugin, type ScanProgressEvent } from './orchestrator.js';

function makePlugin(applicableGlobs: string[]): PluginDescriptor {
  return { id: 'test-plugin', categories: ['code-quality'], applicableGlobs, modulePath: '' };
}

/** Real worker-thread execution (ADR-0011), no mocking — a fixture module standing in for a real plugin so this stays fast. */
function fixturePlugin(id: string): PluginDescriptor {
  return {
    id,
    categories: ['code-quality'],
    applicableGlobs: [],
    modulePath: new URL('./__fixtures__/empty-plugin.mjs', import.meta.url).href,
  };
}

describe('shouldRunPlugin', () => {
  it('always runs a repo-level plugin (empty applicableGlobs), full or incremental', () => {
    const plugin = makePlugin([]);
    expect(shouldRunPlugin(plugin, { repoRoot: '/repo' })).toBe(true);
    expect(shouldRunPlugin(plugin, { repoRoot: '/repo', changedFiles: ['README.md'] })).toBe(true);
  });

  it('always runs a file-scoped plugin on a full scan (no changedFiles)', () => {
    const plugin = makePlugin(['**/*.ts']);
    expect(shouldRunPlugin(plugin, { repoRoot: '/repo' })).toBe(true);
  });

  it('runs a file-scoped plugin on an incremental scan only if a changed file matches', () => {
    const plugin = makePlugin(['**/*.ts']);
    const target: ScanTarget = { repoRoot: '/repo', changedFiles: ['src/index.ts'] };
    expect(shouldRunPlugin(plugin, target)).toBe(true);
  });

  it('skips a file-scoped plugin on an incremental scan when nothing matches', () => {
    const plugin = makePlugin(['**/*.ts']);
    const target: ScanTarget = { repoRoot: '/repo', changedFiles: ['README.md', 'docs/guide.md'] };
    expect(shouldRunPlugin(plugin, target)).toBe(false);
  });

  it('skips a file-scoped plugin when changedFiles is an empty array', () => {
    const plugin = makePlugin(['**/*.ts']);
    const target: ScanTarget = { repoRoot: '/repo', changedFiles: [] };
    expect(shouldRunPlugin(plugin, target)).toBe(false);
  });
});

describe('runScan progress reporting', () => {
  it('emits total, then plugin-start/plugin-finish for each applicable plugin (docs/adr/0023)', async () => {
    const events: ScanProgressEvent[] = [];
    const plugins = [fixturePlugin('a'), fixturePlugin('b')];

    await runScan(
      plugins,
      { scanId: 'scan_1', orgId: 'org_1', repoId: 'repo_1', target: { repoRoot: '/repo' } },
      { timeoutMsPerPlugin: 5000, onProgress: (event) => events.push(event) },
    );

    expect(events[0]).toEqual({ type: 'total', total: 2 });
    const finishes = events.filter((e) => e.type === 'plugin-finish');
    expect(finishes).toHaveLength(2);
    expect(finishes.every((e) => e.type === 'plugin-finish' && e.status === 'success')).toBe(true);
  }, 10000);

  it('aborts every in-flight plugin when the signal fires', async () => {
    const controller = new AbortController();
    const plugin: PluginDescriptor = {
      id: 'hanging',
      categories: ['code-quality'],
      applicableGlobs: [],
      modulePath: new URL('./__fixtures__/hanging-plugin.mjs', import.meta.url).href,
    };

    const resultPromise = runScan(
      [plugin],
      { scanId: 'scan_1', orgId: 'org_1', repoId: 'repo_1', target: { repoRoot: '/repo' } },
      { timeoutMsPerPlugin: 10_000, signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 100);

    const { pluginStatuses } = await resultPromise;
    expect(pluginStatuses[0]?.status).toBe('error');
  }, 10000);
});
