import { ESLint } from 'eslint';
import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { baselineConfig } from './baseline-config.js';
import { mapEslintMessage } from './mapper.js';

const JS_TS_EXTENSION = /\.(js|jsx|ts|tsx)$/;

export class EslintPlugin implements AnalyzerPlugin {
  readonly id = 'eslint';
  readonly categories: AnalyzerPlugin['categories'] = ['code-quality'];
  readonly applicableGlobs = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'];

  async run(context: PluginContext): Promise<Finding[]> {
    const changedFiles = context.target.changedFiles;
    let patterns: string[];
    if (changedFiles === undefined) {
      patterns = ['**/*.{js,jsx,ts,tsx}'];
    } else {
      patterns = changedFiles.filter((f) => JS_TS_EXTENSION.test(f));
      if (patterns.length === 0) {
        return [];
      }
    }

    const eslint = new ESLint({
      cwd: context.target.repoRoot,
      overrideConfigFile: true,
      baseConfig: baselineConfig,
    });

    const results = await eslint.lintFiles(patterns);

    return results.flatMap((result) =>
      result.messages.map((message) => mapEslintMessage(result, message, context)),
    );
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new EslintPlugin().run(context);
}
