import { createRequire } from 'node:module';
import type {
  FunctionSignature,
  GeneratedTestCode,
  GenerateTestsInput,
  JestTestGenerator,
} from '@cqp/core';
import { synthesizeArguments } from './argument-synthesizer.js';
import { serializeValueToLiteral } from './literal-serializer.js';

const requireFromHere = createRequire(import.meta.url);

/**
 * The deterministic, zero-LLM alternative to `GeminiJestTestGenerator`
 * (see docs/adr/0026). Instead of asking a model to guess what a
 * function should return, this actually calls the real function with a
 * synthesized argument and asserts exactly what it really returned (a
 * golden-master/snapshot test) — the class of test that would have
 * gotten `multiply(0, -10)` right (the real result is `-0`) where an LLM
 * guessed the "obviously correct" `0` instead.
 *
 * Real, stated tradeoff: this can't judge correctness either — it'll
 * happily snapshot a genuine bug as "expected" forever, and it only
 * writes one representative case per function, not the multi-case
 * coverage an LLM produces.
 *
 * Real, stated risk: this executes arbitrary code from the target repo
 * directly in this (worker) process, unsandboxed. Acceptable under this
 * platform's existing trust model — every plugin already runs against a
 * trusted local checkout (ADR-0020) — but genuinely different from the
 * Gemini path, where nothing but a prompt string ever leaves the process.
 */
export class ScriptJestTestGenerator implements JestTestGenerator {
  async generateTests(input: GenerateTestsInput): Promise<GeneratedTestCode> {
    const importBase = input.sourceFilePath.replace(/\.[jt]sx?$/, '');
    const mod = this.tryRequireFresh(input.sourceFileAbsolutePath);

    const blocks: string[] = [];
    for (const fn of input.functions) {
      blocks.push(await this.generateBlockFor(fn, mod));
    }

    const importedNames = input.functions.map((f) => f.name).join(', ');
    const content = `const { ${importedNames} } = require('./${importBase}');

${blocks.join('\n\n')}
`;
    return { content };
  }

  /** `null` means real execution isn't available (ESM syntax, a `.ts` file Node can't parse, any other require() failure) — every function below falls back to a smoke test rather than failing generation outright. */
  private tryRequireFresh(absolutePath: string | undefined): Record<string, unknown> | null {
    if (!absolutePath) return null;
    try {
      const resolved = requireFromHere.resolve(absolutePath);
      delete requireFromHere.cache[resolved];
      return requireFromHere(absolutePath) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async generateBlockFor(
    fn: FunctionSignature,
    mod: Record<string, unknown> | null,
  ): Promise<string> {
    const target = mod?.[fn.name];
    if (typeof target !== 'function') {
      return this.smokeBlock(fn);
    }

    const args = synthesizeArguments(fn.parameters);
    const argsLiteral = args.map((a) => serializeValueToLiteral(a) ?? 'undefined').join(', ');
    const call = `${fn.name}(${argsLiteral})`;

    if (fn.isAsync) {
      try {
        const resolvedValue = await (target as (...a: unknown[]) => Promise<unknown>)(...args);
        const serialized = serializeValueToLiteral(resolvedValue);
        if (serialized === null) return this.smokeBlock(fn);
        return this.block(
          fn.name,
          'resolves to its real captured value for a representative input (golden-master, no LLM)',
          `await expect(${call}).resolves.toEqual(${serialized});`,
        );
      } catch {
        return this.block(
          fn.name,
          'rejects for a representative input (real execution, golden-master)',
          `await expect(${call}).rejects.toBeDefined();`,
        );
      }
    }

    try {
      const result = (target as (...a: unknown[]) => unknown)(...args);
      const serialized = serializeValueToLiteral(result);
      if (serialized === null) return this.smokeBlock(fn);
      return this.block(
        fn.name,
        'returns its real captured value for a representative input (golden-master, no LLM)',
        `expect(${call}).toEqual(${serialized});`,
      );
    } catch {
      return this.block(
        fn.name,
        'throws for a representative input (real execution, golden-master)',
        `expect(() => ${call}).toThrow();`,
      );
    }
  }

  private block(name: string, description: string, assertion: string): string {
    return `describe('${name}', () => {
  test('${description}', ${assertion.startsWith('await') ? 'async ' : ''}() => {
    ${assertion}
  });
});`;
  }

  private smokeBlock(fn: FunctionSignature): string {
    return `describe('${fn.name}', () => {
  test('is exported as a function (could not be safely executed at generation time)', () => {
    expect(typeof ${fn.name}).toBe('function');
  });
});`;
  }
}
