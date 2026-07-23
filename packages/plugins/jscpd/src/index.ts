import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AnalyzerPlugin, Finding, PluginContext } from '@cqp/core';
import { runSubprocess } from '@cqp/plugin-shared';
import type { JscpdReport } from './jscpd-output.js';
import { mapJscpdDuplicate } from './mapper.js';

const ENV_VAR = 'CQP_JSCPD_PATH';
const require = createRequire(import.meta.url);

/**
 * jscpd v5 is a Rust binary wrapped by a plain JS launcher script (not a
 * programmatic Node API, despite v4 having one) — resolved via
 * `require.resolve`, then invoked as `node <script>`, which sidesteps the
 * Windows PATHEXT issue ADR-0017 documents entirely, since we're spawning
 * `process.execPath` (always a correct, fully-qualified path), not a bare
 * command name.
 */
function resolveJscpdBinPath(): string {
  const override = process.env[ENV_VAR]?.trim();
  return override && override.length > 0 ? override : require.resolve('jscpd/run-jscpd.js');
}

export class JscpdPlugin implements AnalyzerPlugin {
  readonly id = 'jscpd';
  readonly categories: AnalyzerPlugin['categories'] = ['code-quality'];
  readonly applicableGlobs = ['**/*'];

  async run(context: PluginContext): Promise<Finding[]> {
    const outputDir = await mkdtemp(join(tmpdir(), 'cqp-jscpd-'));

    try {
      const { stderr, exitCode } = await runSubprocess(
        process.execPath,
        [
          resolveJscpdBinPath(),
          '--reporters',
          'json',
          '--min-lines',
          '5',
          '--min-tokens',
          '30',
          '--output',
          outputDir,
          context.target.repoRoot,
        ],
        { cwd: context.target.repoRoot, envVarName: ENV_VAR },
      );

      // jscpd exits non-zero only when --threshold/--exit-code flags are
      // set and duplication exceeds them — neither is passed here, so any
      // non-zero exit is a genuine tool failure.
      if (exitCode !== 0) {
        throw new Error(`jscpd exited ${exitCode}: ${stderr}`.slice(0, 2000));
      }

      const reportPath = join(outputDir, 'jscpd-report.json');
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as JscpdReport;

      return report.duplicates.map((duplicate) => mapJscpdDuplicate(duplicate, context));
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
}

export default async function run(context: PluginContext): Promise<Finding[]> {
  return new JscpdPlugin().run(context);
}
