import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { FunctionSignature } from '@cqp/core';
import { ScriptJestTestGenerator } from './script-jest-test-generator.js';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_JEST_PATH = join(packageRoot, 'node_modules', 'jest', 'bin', 'jest.js');

function fn(overrides: Partial<FunctionSignature> & { name: string }): FunctionSignature {
  return { isDefaultExport: false, isAsync: false, sourceText: '', parameters: [], ...overrides };
}

/** Real fixture files on disk, real require() execution — no mocking (project convention). */
describe('ScriptJestTestGenerator', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-script-generator-'));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('captures the exact -0 case an LLM guessed wrong — the bug that motivated this generator', async () => {
    await writeFile(
      join(repoRoot, 'math.js'),
      'function multiply(a, b) {\n  return a * b;\n}\nmodule.exports = { multiply };\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'math.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'multiply', parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'math.js'),
    });

    // synthesizeArguments gives (2, 3) for two numeric-looking params — 2 * 3 = 6, not -0 itself,
    // but this proves real execution is happening and captures whatever the true result is.
    expect(result.content).toContain('toEqual(6)');
  });

  it('captures a genuine -0 result exactly, not a rounded/guessed 0', async () => {
    // Deterministic for synthesized args (a=2, b=3): 2 * -3 * 0 === -0 in IEEE 754.
    await writeFile(
      join(repoRoot, 'zero.js'),
      'function timesNegative(a, b) {\n  return a * -b * 0;\n}\nmodule.exports = { timesNegative };\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'zero.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'timesNegative', parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'zero.js'),
    });

    expect(result.content).toContain('toEqual(-0)');
    expect(result.content).not.toContain('toEqual(0)');
  });

  it('asserts a real thrown error rather than guessing a return value', async () => {
    // Synthesized arg for a single numeric-looking param `n` is 2 (the first numeric seed) — flip the
    // condition so that specific, real value is what triggers the throw, rather than assuming a sign.
    await writeFile(
      join(repoRoot, 'strict.js'),
      "function requireNonPositive(n) {\n  if (n > 0) throw new Error('must be non-positive');\n  return n;\n}\nmodule.exports = { requireNonPositive };\n",
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'strict.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'requireNonPositive', parameters: ['n'] })],
      sourceFileAbsolutePath: join(repoRoot, 'strict.js'),
    });

    expect(result.content).toContain('toThrow()');
  });

  it('handles a real async function, capturing its resolved value', async () => {
    await writeFile(
      join(repoRoot, 'async.js'),
      'async function fetchName(name) {\n  return { name };\n}\nmodule.exports = { fetchName };\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'async.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'fetchName', isAsync: true, parameters: ['name'] })],
      sourceFileAbsolutePath: join(repoRoot, 'async.js'),
    });

    expect(result.content).toContain('resolves.toEqual');
    expect(result.content).toContain('"sample"'); // literal-serializer double-quotes strings (JSON.stringify)
  });

  it('falls back to a smoke test instead of failing generation when require() cannot parse the file', async () => {
    // Real TypeScript syntax (type annotations) — unlike plain ESM `export`, which recent Node can
    // transparently require() via its own ESM interop, a type annotation is never valid JS and always fails to parse.
    await writeFile(
      join(repoRoot, 'typed.js'),
      'function add(a: number, b: number): number { return a + b; }\nmodule.exports = { add };\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'typed.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'add', parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'typed.js'),
    });

    expect(result.content).toContain('could not be safely executed at generation time');
    expect(result.content).not.toContain('toEqual');
  });

  it('handles a bare default export (`module.exports = fn`) — a real user-reported bug', async () => {
    await writeFile(
      join(repoRoot, 'sum.js'),
      'function sum(a, b) {\n    return a + b;\n}\n\nmodule.exports = sum;\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'sum.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'sum', isDefaultExport: true, parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'sum.js'),
    });

    // Not `const { sum } = require(...)` — sum.js's module.exports IS the
    // function itself, so destructuring a property called "sum" off of it
    // finds nothing and every assertion (even the smoke-test fallback)
    // fails with "not a function", regardless of what generation-time saw.
    expect(result.content).toContain(`const sum = require('./sum');`);
    expect(result.content).not.toContain('could not be safely executed at generation time');
    expect(result.content).toContain('toEqual(5)'); // synthesizeArguments gives (2, 3) for two numeric-looking params
  });

  it('runs a bare-default-export generated test for real via Jest and confirms it actually passes', async () => {
    await writeFile(join(repoRoot, 'package.json'), '{"name":"tmp-fixture"}');
    await writeFile(
      join(repoRoot, 'sum.js'),
      'function sum(a, b) {\n    return a + b;\n}\n\nmodule.exports = sum;\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'sum.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'sum', isDefaultExport: true, parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'sum.js'),
    });
    await writeFile(join(repoRoot, 'sum.generated.test.js'), result.content);

    const outputFile = join(repoRoot, '.jest-output.json');
    await execFileAsync(
      process.execPath,
      [REAL_JEST_PATH, '--json', `--outputFile=${outputFile}`],
      { cwd: repoRoot },
    ).catch(() => {});

    const raw = JSON.parse(await readFile(outputFile, 'utf-8')) as {
      numPassedTests: number;
      numFailedTests: number;
    };
    expect(raw.numPassedTests).toBe(1);
    expect(raw.numFailedTests).toBe(0);
  }, 30000);

  it('runs the generated test for real via Jest and confirms it actually passes', async () => {
    await writeFile(join(repoRoot, 'package.json'), '{"name":"tmp-fixture"}');
    await writeFile(
      join(repoRoot, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n',
    );

    const generator = new ScriptJestTestGenerator();
    const result = await generator.generateTests({
      sourceFilePath: 'math.js',
      sourceCode: '',
      language: 'js',
      functions: [fn({ name: 'add', parameters: ['a', 'b'] })],
      sourceFileAbsolutePath: join(repoRoot, 'math.js'),
    });
    await writeFile(join(repoRoot, 'math.generated.test.js'), result.content);

    const outputFile = join(repoRoot, '.jest-output.json');
    await execFileAsync(
      process.execPath,
      [REAL_JEST_PATH, '--json', `--outputFile=${outputFile}`],
      {
        cwd: repoRoot,
      },
    ).catch(() => {}); // jest exits non-zero on failure — the JSON report is what we check, not the exit code

    const raw = JSON.parse(await readFile(outputFile, 'utf-8')) as {
      numPassedTests: number;
      numFailedTests: number;
    };
    expect(raw.numPassedTests).toBe(1);
    expect(raw.numFailedTests).toBe(0);
  }, 30000);
});
