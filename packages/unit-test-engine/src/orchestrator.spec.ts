import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GenerateTestsInput, GeneratedTestCode, JestTestGenerator } from '@cqp/core';
import { runUnitTestGeneration, type UnitTestProgressEvent } from './orchestrator.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const REAL_JEST_PATH = join(packageRoot, 'node_modules', 'jest', 'bin', 'jest.js');

/** A deterministic stand-in for the real Gemini-backed generator — real jest execution still happens for real below (project convention: fake the paid external API, keep everything else real). */
class TemplateJestTestGenerator implements JestTestGenerator {
  public readonly calls: GenerateTestsInput[] = [];

  async generateTests(input: GenerateTestsInput): Promise<GeneratedTestCode> {
    this.calls.push(input);
    const fn = input.functions[0]!;
    // A trivial self-contained assertion, deliberately not requiring the
    // real source file — this test is verifying the orchestrator's
    // plumbing (discovery -> extraction -> generator call -> file write
    // -> real jest execution), not real generation quality (that's
    // Gemini's job, verified live against the real API separately).
    return {
      content: `
        describe('${fn.name}', () => {
          it('was found by the orchestrator', () => {
            expect('${fn.name}').toBe('${fn.name}');
          });
        });
      `,
    };
  }
}

describe('runUnitTestGeneration', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-unit-test-orchestrator-'));
    process.env.CQP_JEST_PATH = REAL_JEST_PATH;
    await writeFile(join(repoRoot, 'package.json'), '{"name":"tmp-fixture"}');
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    if (originalJestPath === undefined) {
      delete process.env.CQP_JEST_PATH;
    } else {
      process.env.CQP_JEST_PATH = originalJestPath;
    }
  });

  it('writes the generated test under Unit tests/AI Based, mirroring the source path, and runs it for real', async () => {
    await writeFile(
      join(repoRoot, 'greet.js'),
      `export function greet(name) { return 'hello ' + name; }`,
    );

    const generator = new TemplateJestTestGenerator();
    const events: UnitTestProgressEvent[] = [];

    const result = await runUnitTestGeneration(
      repoRoot,
      { path: 'greet.js' },
      'gemini',
      generator,
      {
        onProgress: (e) => events.push(e),
      },
    );

    expect(generator.calls).toHaveLength(1);
    expect(generator.calls[0]?.functions[0]?.name).toBe('greet');

    const expectedTestPath = join('Unit tests', 'AI Based', 'greet.generated.test.js');
    expect(result.generatedFiles).toEqual([
      { sourceFilePath: 'greet.js', testFilePath: expectedTestPath },
    ]);
    const writtenContent = await readFile(join(repoRoot, expectedTestPath), 'utf-8');
    expect(writtenContent).toContain("describe('greet'");

    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);

    expect(events[0]).toEqual({ type: 'total', total: 1 });
    expect(events.some((e) => e.type === 'file-start')).toBe(true);
    expect(events.some((e) => e.type === 'file-finish')).toBe(true);

    const report = JSON.parse(
      await readFile(
        join(repoRoot, 'Unit tests', 'AI Based', 'greet.js', 'execution report', 'report.json'),
        'utf-8',
      ),
    );
    expect(report.generator).toBe('gemini');
    expect(report.testsTotal).toBe(1);
    expect(report.testsPassed).toBe(1);
  }, 30000);

  it('writes a script-generated test under Unit tests/Script based instead', async () => {
    await writeFile(join(repoRoot, 'greet.js'), `export function greet() { return 1; }`);
    const generator = new TemplateJestTestGenerator();

    const result = await runUnitTestGeneration(repoRoot, { path: 'greet.js' }, 'script', generator);

    const expectedTestPath = join('Unit tests', 'Script based', 'greet.generated.test.js');
    expect(result.generatedFiles).toEqual([
      { sourceFilePath: 'greet.js', testFilePath: expectedTestPath },
    ]);
    await expect(readFile(join(repoRoot, expectedTestPath), 'utf-8')).resolves.toBeTruthy();
  }, 30000);

  it("overrides a previous run against the same target, removing a since-deleted source file's stale generated test", async () => {
    await writeFile(join(repoRoot, 'a.js'), `export function a() { return 1; }`);
    await writeFile(join(repoRoot, 'b.js'), `export function b() { return 2; }`);
    const generator = new TemplateJestTestGenerator();

    await runUnitTestGeneration(repoRoot, { path: '.' }, 'gemini', generator);
    const staleTestPath = join(repoRoot, 'Unit tests', 'AI Based', 'a.generated.test.js');
    await expect(readFile(staleTestPath, 'utf-8')).resolves.toBeTruthy();

    await rm(join(repoRoot, 'a.js'));
    await runUnitTestGeneration(repoRoot, { path: '.' }, 'gemini', generator);

    await expect(readFile(staleTestPath, 'utf-8')).rejects.toThrow();
    await expect(
      readFile(join(repoRoot, 'Unit tests', 'AI Based', 'b.generated.test.js'), 'utf-8'),
    ).resolves.toBeTruthy();
  }, 30000);

  it('rejects a functionName target that points at a directory', async () => {
    const generator = new TemplateJestTestGenerator();
    await expect(
      runUnitTestGeneration(repoRoot, { path: '.', functionName: 'anything' }, 'gemini', generator),
    ).rejects.toThrow('single file, not a directory');
  });

  it("rewrites a generated test's relative imports so they resolve from the real nested output location (live-reproduced bug, docs/adr/0047)", async () => {
    await mkdir(join(repoRoot, 'src', 'utils'), { recursive: true });
    await mkdir(join(repoRoot, 'src', 'controllers'), { recursive: true });
    await writeFile(
      join(repoRoot, 'src', 'utils', 'catchAsync.js'),
      `module.exports = (fn) => (req, res, next) => fn(req, res, next).catch(next);`,
    );
    await writeFile(
      join(repoRoot, 'src', 'controllers', 'health.controller.js'),
      `const catchAsync = require('../utils/catchAsync');\n` +
        `exports.getHealth = catchAsync(async (req, res) => { res.json({ status: 'ok' }); });`,
    );

    // Writes exactly what a real generator would (both generators write
    // relative imports as if co-located with the source — the bug this
    // test guards against is the orchestrator failing to correct them for
    // the real, nested `Unit tests/AI Based/...` output location).
    class SiblingImportGenerator implements JestTestGenerator {
      async generateTests(): Promise<GeneratedTestCode> {
        return {
          content:
            `jest.mock('../utils/catchAsync', () => (fn) => fn);\n` +
            `const { getHealth } = require('./health.controller');\n\n` +
            `describe('getHealth', () => {\n` +
            `  it('is a function', () => {\n` +
            `    expect(typeof getHealth).toBe('function');\n` +
            `  });\n` +
            `});\n`,
        };
      }
    }

    const result = await runUnitTestGeneration(
      repoRoot,
      { path: 'src/controllers/health.controller.js' },
      'gemini',
      new SiblingImportGenerator(),
    );

    // The real bug: this used to be 0 with a misleading "check testMatch"
    // error, because the un-rewritten imports made jest fail to even load
    // the test suite (module not found), registering zero tests.
    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);
  }, 30000);

  it('stops before running jest when the signal is already aborted', async () => {
    await writeFile(join(repoRoot, 'a.js'), `export function a() { return 1; }`);
    const controller = new AbortController();
    controller.abort();

    const generator = new TemplateJestTestGenerator();
    const result = await runUnitTestGeneration(repoRoot, { path: 'a.js' }, 'gemini', generator, {
      signal: controller.signal,
    });

    expect(generator.calls).toHaveLength(0);
    expect(result.testsTotal).toBe(0);
  });
});
