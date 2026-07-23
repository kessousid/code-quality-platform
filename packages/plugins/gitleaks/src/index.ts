import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { resolveExecutablePath, runSubprocess } from '@cqp/plugin-shared';
import type { GitleaksOutput } from './gitleaks-output.js';
import { mapGitleaksFinding } from './mapper.js';

const ENV_VAR = 'CQP_GITLEAKS_PATH';

/**
 * Adapter over the gitleaks CLI (secret detection). Runs with `--no-git`
 * so it scans the working tree directly rather than git history — this
 * platform's scans work against a checked-out ref, not a full history
 * walk, and `--no-git` is also what lets it run against a plain directory
 * that isn't a git repository at all (e.g. a fixture in tests).
 */
export class GitleaksPlugin implements AnalyzerPlugin {
  readonly id = 'gitleaks';
  readonly categories: AnalyzerPlugin['categories'] = ['secret-detection'];
  readonly applicableGlobs = ['**/*'];

  async run(context: PluginContext): Promise<Finding[]> {
    const command = resolveExecutablePath(ENV_VAR, 'gitleaks');

    const { stdout, stderr, exitCode } = await runSubprocess(
      command,
      [
        'detect',
        '--no-git',
        '--source',
        context.target.repoRoot,
        '--report-format',
        'json',
        '--report-path',
        '-',
        '--exit-code',
        '0',
      ],
      { cwd: context.target.repoRoot, envVarName: ENV_VAR },
    );

    if (exitCode !== 0) {
      throw new Error(`gitleaks exited ${exitCode}: ${stderr}`.slice(0, 2000));
    }

    let output: GitleaksOutput;
    try {
      output = stdout.trim().length > 0 ? (JSON.parse(stdout) as GitleaksOutput) : [];
    } catch {
      throw new Error(`gitleaks produced non-JSON output: ${stderr || stdout}`.slice(0, 2000));
    }

    return output.map((finding) => mapGitleaksFinding(finding, context));
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new GitleaksPlugin().run(context);
}
