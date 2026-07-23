import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { resolveExecutablePath, runSubprocess } from '@cqp/plugin-shared';
import type { OsvOutput } from './osv-output.js';
import { mapOsvOutput } from './mapper.js';

const ENV_VAR = 'CQP_OSV_SCANNER_PATH';

/**
 * Adapter over OSV-Scanner (dependency vulnerabilities, ADR-0001). Exit
 * code 1 means "vulnerabilities found," not failure — like Semgrep and
 * gitleaks, only a genuinely unparseable result is treated as an error.
 */
export class OsvScannerPlugin implements AnalyzerPlugin {
  readonly id = 'osv-scanner';
  readonly categories: AnalyzerPlugin['categories'] = ['dependency-vulnerability'];
  readonly applicableGlobs = ['**/package.json', '**/package-lock.json', '**/pnpm-lock.yaml'];

  async run(context: PluginContext): Promise<Finding[]> {
    const command = resolveExecutablePath(ENV_VAR, 'osv-scanner');

    const { stdout, stderr, exitCode } = await runSubprocess(
      command,
      ['scan', 'source', '--format', 'json', context.target.repoRoot],
      { cwd: context.target.repoRoot, envVarName: ENV_VAR },
    );

    if (exitCode !== 0 && exitCode !== 1) {
      throw new Error(`osv-scanner exited ${exitCode}: ${stderr}`.slice(0, 2000));
    }

    let output: OsvOutput;
    try {
      output = JSON.parse(stdout) as OsvOutput;
    } catch {
      throw new Error(`osv-scanner produced non-JSON output: ${stderr || stdout}`.slice(0, 2000));
    }

    return mapOsvOutput(output, context);
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new OsvScannerPlugin().run(context);
}
