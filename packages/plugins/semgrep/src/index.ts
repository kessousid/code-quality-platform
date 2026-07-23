import { resolve } from 'node:path';
import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { resolveExecutablePath, runSubprocess } from '@cqp/plugin-shared';
import type { SemgrepOutput } from './semgrep-output.js';
import { mapSemgrepResult } from './mapper.js';

const ENV_VAR = 'CQP_SEMGREP_PATH';

/**
 * Adapter over the Semgrep CLI (security + cross-language quality rules).
 * Uses the pinned `p/default` registry pack, not `--config=auto` — auto
 * requires metrics/telemetry to be enabled to pick a ruleset, which this
 * platform should never enable silently on a user's behalf. See
 * docs/adr/0001 and docs/adr/0017.
 */
export class SemgrepPlugin implements AnalyzerPlugin {
  readonly id = 'semgrep';
  readonly categories: AnalyzerPlugin['categories'] = ['security', 'code-quality'];
  readonly applicableGlobs = ['**/*'];

  async run(context: PluginContext): Promise<Finding[]> {
    const command = resolveExecutablePath(ENV_VAR, 'semgrep');
    const targets = context.target.changedFiles?.length
      ? context.target.changedFiles.map((f) => resolve(context.target.repoRoot, f))
      : [context.target.repoRoot];

    const { stdout, stderr } = await runSubprocess(
      command,
      ['--config=p/default', '--json', '--quiet', '--metrics=off', ...targets],
      { cwd: context.target.repoRoot, envVarName: ENV_VAR },
    );

    let output: SemgrepOutput;
    try {
      output = JSON.parse(stdout) as SemgrepOutput;
    } catch {
      throw new Error(`semgrep produced non-JSON output: ${stderr || stdout}`.slice(0, 2000));
    }

    return output.results.map((result) => mapSemgrepResult(result, context));
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new SemgrepPlugin().run(context);
}
