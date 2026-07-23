import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { AnalysisCategory } from '@cqp/core';

export interface PluginDescriptor {
  id: string;
  categories: AnalysisCategory[];
  applicableGlobs: string[];
  /** file:// URL — see docs/adr/0018, resolved once here rather than per-scan. */
  modulePath: string;
}

const require = createRequire(import.meta.url);

function resolveModulePath(packageName: string): string {
  return pathToFileURL(require.resolve(packageName)).href;
}

/**
 * The MVP analyzer set (see BACKLOG.md's priority order). Adding a new
 * plugin package means adding one entry here — the orchestrator itself
 * never changes.
 */
export const builtinPlugins: PluginDescriptor[] = [
  {
    id: 'semgrep',
    categories: ['security', 'code-quality'],
    applicableGlobs: ['**/*'],
    modulePath: resolveModulePath('@cqp/plugin-semgrep'),
  },
  {
    id: 'gitleaks',
    categories: ['secret-detection'],
    applicableGlobs: ['**/*'],
    modulePath: resolveModulePath('@cqp/plugin-gitleaks'),
  },
  {
    id: 'osv-scanner',
    categories: ['dependency-vulnerability'],
    applicableGlobs: ['**/package.json', '**/package-lock.json', '**/pnpm-lock.yaml'],
    modulePath: resolveModulePath('@cqp/plugin-osv-scanner'),
  },
  {
    id: 'eslint',
    categories: ['code-quality'],
    applicableGlobs: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    modulePath: resolveModulePath('@cqp/plugin-eslint'),
  },
  {
    id: 'jscpd',
    categories: ['code-quality'],
    applicableGlobs: ['**/*'],
    modulePath: resolveModulePath('@cqp/plugin-jscpd'),
  },
  {
    id: 'dependency-graph',
    categories: ['architecture'],
    applicableGlobs: [],
    modulePath: resolveModulePath('@cqp/plugin-dependency-graph'),
  },
];
