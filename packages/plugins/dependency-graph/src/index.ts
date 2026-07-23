import madge from 'madge';
import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { mapCircularDependency } from './mapper.js';

/**
 * Adapter over madge (module dependency graph + circular-dependency
 * detection). `AnalyzerPlugin.run()` only returns `Finding[]`, so this
 * plugin's scope is circular-dependency findings specifically — the full
 * graph structure for the Phase 10 dashboard visualization
 * (`Scan.dependencyGraphStorageKey`, ADR-0009) is a separate artifact the
 * orchestrator would capture directly via madge's `.obj()`, not something
 * that fits through this per-finding contract.
 */
export class DependencyGraphPlugin implements AnalyzerPlugin {
  readonly id = 'dependency-graph';
  readonly categories: AnalyzerPlugin['categories'] = ['architecture'];
  readonly applicableGlobs: string[] = [];

  async run(context: PluginContext): Promise<Finding[]> {
    const result = await madge(context.target.repoRoot);
    const cycles = result.circular();

    return cycles.map((cycle) => mapCircularDependency(cycle, context));
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new DependencyGraphPlugin().run(context);
}
