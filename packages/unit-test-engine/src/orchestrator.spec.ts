import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('generates a real test file next to the source, writes it to disk, and runs it for real', async () => {
    await writeFile(
      join(repoRoot, 'greet.js'),
      `export function greet(name) { return 'hello ' + name; }`,
    );

    const generator = new TemplateJestTestGenerator();
    const events: UnitTestProgressEvent[] = [];

    const result = await runUnitTestGeneration(repoRoot, { path: 'greet.js' }, generator, {
      onProgress: (e) => events.push(e),
    });

    expect(generator.calls).toHaveLength(1);
    expect(generator.calls[0]?.functions[0]?.name).toBe('greet');

    expect(result.generatedFiles).toEqual([
      { sourceFilePath: 'greet.js', testFilePath: 'greet.generated.test.js' },
    ]);
    const writtenContent = await readFile(join(repoRoot, 'greet.generated.test.js'), 'utf-8');
    expect(writtenContent).toContain("describe('greet'");

    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(1);
    expect(result.testsFailed).toBe(0);

    expect(events[0]).toEqual({ type: 'total', total: 1 });
    expect(events.some((e) => e.type === 'file-start')).toBe(true);
    expect(events.some((e) => e.type === 'file-finish')).toBe(true);
  }, 30000);

  it('rejects a functionName target that points at a directory', async () => {
    const generator = new TemplateJestTestGenerator();
    await expect(
      runUnitTestGeneration(repoRoot, { path: '.', functionName: 'anything' }, generator),
    ).rejects.toThrow('single file, not a directory');
  });

  it('stops before running jest when the signal is already aborted', async () => {
    await writeFile(join(repoRoot, 'a.js'), `export function a() { return 1; }`);
    const controller = new AbortController();
    controller.abort();

    const generator = new TemplateJestTestGenerator();
    const result = await runUnitTestGeneration(repoRoot, { path: 'a.js' }, generator, {
      signal: controller.signal,
    });

    expect(generator.calls).toHaveLength(0);
    expect(result.testsTotal).toBe(0);
  });
});
