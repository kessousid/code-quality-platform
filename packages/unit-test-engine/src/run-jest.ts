import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  runSubprocess,
  ToolNotFoundError,
  withUnhandledRejectionsAsWarnings,
} from '@cqp/plugin-shared';
import type { TestCaseResult } from '@cqp/core';

export interface JestCommand {
  command: string;
  leadingArgs: string[];
}

/**
 * Same env-var-override-then-local-install pattern as every other
 * shelled-out tool (docs/adr/0017), with one Windows-specific twist:
 * `node_modules/.bin/jest.cmd` is a batch script, and
 * `child_process.spawn()` cannot execute `.cmd`/`.bat` files directly
 * without `shell: true` — which this codebase deliberately avoids for
 * argument-injection reasons (see resolve-executable.ts). The fix used
 * there (append `.exe`) doesn't apply here because jest has no `.exe`.
 * Instead, resolve past the shim to jest's real JS entry point and
 * invoke it with the current `node` binary directly — no shell, no
 * batch file, same safety property.
 *
 * Returns `null` (never throws) when nothing is found locally — the
 * caller decides whether that means "install it" or "give up" (see
 * `ensureJestAvailable` below). A bare `jest`/`jest.cmd`-on-PATH
 * fallback is deliberately not attempted: confirmed live that
 * `spawn('jest.cmd', ...)` on Windows throws `EINVAL`, not `ENOENT` — a
 * different error code than `ToolNotFoundError` checked for, which
 * silently swallowed the real failure into a useless "no report"
 * message.
 */
export function resolveJestCommand(repoRoot: string): JestCommand | null {
  const override = process.env.CQP_JEST_PATH?.trim();
  if (override && override.length > 0) {
    // A .js override (e.g. a direct path to jest's own bin/jest.js) needs the same node-invocation treatment as the default resolution path below.
    return override.endsWith('.js')
      ? { command: process.execPath, leadingArgs: [override] }
      : { command: override, leadingArgs: [] };
  }

  const jestCliEntry = join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
  if (existsSync(jestCliEntry)) {
    return { command: process.execPath, leadingArgs: [jestCliEntry] };
  }

  return null;
}

/**
 * npm ships bundled with Node.js itself, so its real CLI entry can be
 * resolved the same no-shell way as jest's — via `node <npm-cli.js>`,
 * next to whatever `node` binary is currently running this process.
 * `CQP_NPM_PATH` mirrors every other tool's override convention if a
 * different npm needs pointing at (e.g. a portable install elsewhere).
 */
function resolveNpmCommand(): JestCommand {
  const override = process.env.CQP_NPM_PATH?.trim();
  if (override && override.length > 0) {
    return override.endsWith('.js')
      ? { command: process.execPath, leadingArgs: [override] }
      : { command: override, leadingArgs: [] };
  }

  const bundledNpmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(bundledNpmCli)) {
    return { command: process.execPath, leadingArgs: [bundledNpmCli] };
  }

  throw new ToolNotFoundError('npm', 'CQP_NPM_PATH');
}

const BABEL_TYPESCRIPT_DEV_DEPENDENCIES = [
  'babel-jest',
  '@babel/core',
  '@babel/preset-env',
  '@babel/preset-typescript',
];

/**
 * Zero-setup by design (see docs/adr/0024's follow-up): a real team
 * shouldn't have to manually `npm install jest` in every repo before
 * this feature works. If jest isn't resolvable, install it (and, for a
 * TypeScript target with no babel config of its own yet, the babel
 * TypeScript preset too) as real devDependencies in the target repo,
 * then re-resolve. Only ever adds a `babel.config.cjs` when the target
 * has none — an existing config (ts-jest or otherwise) is never
 * touched or second-guessed.
 */
export async function ensureJestAvailable(
  repoRoot: string,
  needsTypeScriptTransform: boolean,
): Promise<JestCommand> {
  const existing = resolveJestCommand(repoRoot);
  if (existing) return existing;

  const packages = needsTypeScriptTransform
    ? ['jest', ...BABEL_TYPESCRIPT_DEV_DEPENDENCIES]
    : ['jest'];
  const { command, leadingArgs } = resolveNpmCommand();

  console.log(
    `[unit-test-engine] jest not found in ${repoRoot} — installing ${packages.join(', ')} as devDependencies`,
  );
  const install = await runSubprocess(
    command,
    [...leadingArgs, 'install', '--save-dev', ...packages],
    {
      cwd: repoRoot,
      envVarName: 'CQP_NPM_PATH',
    },
  );
  if (install.exitCode !== 0) {
    // runSubprocess only rejects on a failed spawn — a non-zero exit (no network/registry access, auth failure, disk lock) resolves normally, so it must be checked explicitly here or the real cause is lost.
    throw new Error(
      `npm install --save-dev ${packages.join(' ')} failed (exit ${install.exitCode}) in ${repoRoot}:\n${install.stderr || install.stdout}`,
    );
  }

  if (needsTypeScriptTransform) {
    const babelConfigPath = join(repoRoot, 'babel.config.cjs');
    if (!existsSync(babelConfigPath)) {
      await writeFile(
        babelConfigPath,
        "module.exports = {\n  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],\n};\n",
      );
    }
  }

  const resolved = resolveJestCommand(repoRoot);
  if (!resolved) {
    // npm reported success (exit 0) but jest still isn't resolvable at the expected path. The single most common real cause (confirmed live): repoRoot is a subfolder of the actual project (e.g. `src`), so npm walked up to the real project's package.json and installed/hoisted jest there instead of at repoRoot — a missing package.json right here is a strong, cheap signal for exactly that.
    if (!existsSync(join(repoRoot, 'package.json'))) {
      throw new Error(
        `No package.json found in ${repoRoot} — this repo's local checkout path looks like it points at a subfolder of the real project, not the project root itself. Point the repo's localPath at the folder that directly contains package.json (the one \`npm install\`/\`jest\` would actually run from), then try again.`,
      );
    }
    throw new ToolNotFoundError('jest', 'CQP_JEST_PATH');
  }
  return resolved;
}

interface JestJsonAssertionResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  duration?: number | null;
  failureMessages: string[];
}

interface JestJsonTestResult {
  name: string;
  assertionResults: JestJsonAssertionResult[];
}

interface JestJsonOutput {
  testResults: JestJsonTestResult[];
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
}

const STATUS_MAP: Record<JestJsonAssertionResult['status'], TestCaseResult['status']> = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  todo: 'skipped',
};

export class NoTestsFoundError extends Error {
  constructor() {
    super(
      "jest ran but found no tests among the generated files — check the target project's Jest config " +
        '(testMatch/testPathIgnorePatterns) actually includes *.generated.test.* files.',
    );
    this.name = 'NoTestsFoundError';
  }
}

export interface RunJestResult {
  results: Omit<TestCaseResult, 'id' | 'runId'>[];
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
}

/**
 * Runs jest against exactly the files this run generated — nothing else
 * in the project (docs/adr/0024). Positional args on Windows are matched
 * as regexes against the absolute path, so backslashes are normalized to
 * forward slashes first (a literal `\f`, `\b`, etc. right after a path
 * separator would otherwise be read as a regex escape, not a path
 * separator) and every path is OR'd into one pattern.
 */
export async function runJest(
  repoRoot: string,
  testFileAbsolutePaths: string[],
): Promise<RunJestResult> {
  if (testFileAbsolutePaths.length === 0) {
    return { results: [], testsTotal: 0, testsPassed: 0, testsFailed: 0 };
  }

  const needsTypeScriptTransform = testFileAbsolutePaths.some((p) =>
    ['.ts', '.tsx'].includes(extname(p)),
  );
  const { command, leadingArgs } = await ensureJestAvailable(repoRoot, needsTypeScriptTransform);
  const outputFile = join(repoRoot, `.cqp-jest-output-${Date.now()}.json`);
  const pattern = testFileAbsolutePaths.map((p) => p.replace(/\\/g, '/')).join('|');

  let stderr = '';
  try {
    const result = await runSubprocess(
      command,
      [...leadingArgs, '--json', `--outputFile=${outputFile}`, pattern],
      {
        cwd: repoRoot,
        envVarName: 'CQP_JEST_PATH',
        env: withUnhandledRejectionsAsWarnings(),
      },
    );
    stderr = result.stderr;
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      throw error;
    }
    // jest exits non-zero when any test fails — that's expected, not a tool failure; the JSON report is still written.
  }

  const raw = await readFile(outputFile, 'utf-8').catch(() => null);
  await rm(outputFile, { force: true }).catch(() => {});

  if (raw === null) {
    // Most commonly a transform/config problem (e.g. TS source but no ts-jest configured in the target project) that crashed jest before it could write a report — surface jest's own stderr rather than a bare "no report" message.
    throw new Error(
      `jest did not produce a JSON report — it likely failed to start.${stderr ? `\n\n${stderr}` : ''}`,
    );
  }

  const parsed = JSON.parse(raw) as JestJsonOutput;
  if (parsed.numTotalTests === 0) {
    throw new NoTestsFoundError();
  }

  const results: Omit<TestCaseResult, 'id' | 'runId'>[] = [];
  for (const testFile of parsed.testResults) {
    for (const assertion of testFile.assertionResults) {
      results.push({
        testFilePath: testFile.name,
        testName: assertion.title,
        status: STATUS_MAP[assertion.status],
        ...(assertion.duration != null ? { durationMs: assertion.duration } : {}),
        ...(assertion.failureMessages.length > 0
          ? { failureMessage: assertion.failureMessages.join('\n') }
          : {}),
      });
    }
  }

  return {
    results,
    testsTotal: parsed.numTotalTests,
    testsPassed: parsed.numPassedTests,
    testsFailed: parsed.numFailedTests,
  };
}
