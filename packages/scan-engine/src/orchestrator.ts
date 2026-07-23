import { minimatch } from 'minimatch';
import type { Finding, PluginContext, ScanTarget } from '@cqp/core';
import { runIsolated } from '@cqp/plugin-runtime';
import type { PluginDescriptor } from './plugin-registry.js';

export type PluginRunStatus =
  | { pluginId: string; status: 'success'; findingCount: number }
  | { pluginId: string; status: 'error'; message: string }
  | { pluginId: string; status: 'timeout' };

export interface ScanEngineResult {
  findings: Finding[];
  pluginStatuses: PluginRunStatus[];
}

export type ScanProgressEvent =
  | { type: 'total'; total: number }
  | { type: 'plugin-start'; pluginId: string }
  | { type: 'plugin-finish'; pluginId: string; status: PluginRunStatus['status'] };

export interface RunScanOptions {
  timeoutMsPerPlugin: number;
  /** Fired as each applicable plugin starts/finishes — see docs/adr/0023's live-progress feature. */
  onProgress?: (event: ScanProgressEvent) => void;
  /** Cancelling a scan aborts every still-running plugin's worker thread, not just the ones that haven't started yet. */
  signal?: AbortSignal;
}

/**
 * File classification decides whether a plugin runs at all, not what it
 * scans internally (see docs/adr/0018). A full scan always runs every
 * plugin — narrowing to "is there even a relevant file" only matters once
 * there's a changedFiles list to narrow against.
 */
export function shouldRunPlugin(plugin: PluginDescriptor, target: ScanTarget): boolean {
  if (plugin.applicableGlobs.length === 0) return true;
  if (!target.changedFiles) return true;
  return target.changedFiles.some((file) =>
    plugin.applicableGlobs.some((glob) => minimatch(file, glob)),
  );
}

export async function runScan(
  plugins: PluginDescriptor[],
  context: Omit<PluginContext, 'timeoutMs'>,
  options: RunScanOptions,
): Promise<ScanEngineResult> {
  const applicablePlugins = plugins.filter((plugin) => shouldRunPlugin(plugin, context.target));
  options.onProgress?.({ type: 'total', total: applicablePlugins.length });

  const outcomes = await Promise.all(
    applicablePlugins.map(async (plugin) => {
      options.onProgress?.({ type: 'plugin-start', pluginId: plugin.id });
      const pluginContext: PluginContext = { ...context, timeoutMs: options.timeoutMsPerPlugin };
      const result = await runIsolated<PluginContext, Finding[]>(
        { modulePath: plugin.modulePath },
        pluginContext,
        {
          timeoutMs: options.timeoutMsPerPlugin,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      options.onProgress?.({ type: 'plugin-finish', pluginId: plugin.id, status: result.status });
      return { pluginId: plugin.id, result };
    }),
  );

  const findings: Finding[] = [];
  const pluginStatuses: PluginRunStatus[] = [];

  for (const outcome of outcomes) {
    if (outcome.result.status === 'success') {
      findings.push(...outcome.result.result);
      pluginStatuses.push({
        pluginId: outcome.pluginId,
        status: 'success',
        findingCount: outcome.result.result.length,
      });
    } else if (outcome.result.status === 'timeout') {
      pluginStatuses.push({ pluginId: outcome.pluginId, status: 'timeout' });
    } else {
      pluginStatuses.push({
        pluginId: outcome.pluginId,
        status: 'error',
        message: outcome.result.message,
      });
    }
  }

  return { findings, pluginStatuses };
}
