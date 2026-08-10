import { describe, expect, it } from 'vitest';
import type { GenerateTestsInput } from '@cqp/core';
import { buildPrompt } from './prompt-builder.js';

describe('buildPrompt', () => {
  it('embeds the source code, function names, and a same-directory-as-source import path (docs/adr/0047: rewritten to the real location by a separate step)', () => {
    const input: GenerateTestsInput = {
      sourceFilePath: 'src/math.ts',
      sourceCode: 'export function add(a: number, b: number) { return a + b; }',
      language: 'ts',
      functions: [
        {
          name: 'add',
          isDefaultExport: false,
          isAsync: false,
          sourceText: 'export function add() {}',
          parameters: ['a', 'b'],
        },
      ],
    };

    const prompt = buildPrompt(input);

    expect(prompt).toContain('src/math.ts');
    expect(prompt).toContain('export function add(a: number, b: number)');
    expect(prompt).toContain('- add');
    expect(prompt).toContain("from './math'");
    expect(prompt).toContain('No markdown code fences');
  });

  it('flags async functions distinctly so the prompt asks for async/await coverage', () => {
    const input: GenerateTestsInput = {
      sourceFilePath: 'user.ts',
      sourceCode: 'export const fetchUser = async () => {};',
      language: 'ts',
      functions: [
        {
          name: 'fetchUser',
          isDefaultExport: false,
          isAsync: true,
          sourceText: '',
          parameters: [],
        },
      ],
    };

    expect(buildPrompt(input)).toContain('- fetchUser (async)');
  });
});
