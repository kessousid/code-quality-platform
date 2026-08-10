import { basename } from 'node:path';
import type { GenerateTestsInput } from '@cqp/core';

/** The one real prompt this whole module sends — see docs/adr/0024 for why a prompt is the only place this platform still calls an LLM. */
export function buildPrompt(input: GenerateTestsInput): string {
  const functionList = input.functions
    .map((f) => `- ${f.name}${f.isAsync ? ' (async)' : ''}`)
    .join('\n');
  const importBase = basename(input.sourceFilePath).replace(/\.[jt]sx?$/, '');
  const isTypeScript = input.language === 'ts' || input.language === 'tsx';

  return `You are writing a Jest unit test file for the function(s) below.

Source file: ${input.sourceFilePath}
Full source code of that file:
\`\`\`${input.language}
${input.sourceCode}
\`\`\`

Write tests for exactly these exported function(s):
${functionList}

Requirements:
- Output ONLY the complete contents of a single Jest test file. No markdown code fences, no explanation, no commentary — just the raw file content, ready to save to disk and run as-is.
- Import the function(s) under test from './${importBase}'. Write this and every other relative import (e.g. any jest.mock() of a dependency this source file itself imports via a relative path) exactly as if this test file were saved in the very same directory as the source file — a separate step corrects the actual paths afterward, so don't try to account for the real save location yourself.
- Use real, meaningful assertions based on what the function actually does — never a TODO placeholder or a trivially-true assertion.
- Cover the normal case, at least one realistic edge case (e.g. empty input, zero, negative numbers, null/undefined where plausible for the function's parameters), and error handling if the function can throw or reject.
- If a function is async, use async/await and cover both the resolved and rejected paths where that's meaningful.
- Mock any imported external dependencies (network calls, file system, database clients, other modules) with jest.mock() — the generated test must never make a real network or filesystem call.
- Use ${isTypeScript ? 'TypeScript' : 'JavaScript'} syntax matching the source file's own module style (ESM import/export, since that's what the source file uses).
`;
}
