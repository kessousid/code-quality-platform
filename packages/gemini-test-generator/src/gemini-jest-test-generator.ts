import { GoogleGenAI } from '@google/genai';
import type { GenerateTestsInput, GeneratedTestCode, JestTestGenerator } from '@cqp/core';
import { buildPrompt } from './prompt-builder.js';
import { extractCode } from './extract-code.js';

/** An alias Google keeps pointed at its current recommended flash model — avoids hardcoding a specific dated model name that later gets deprecated for new API keys (confirmed live: `gemini-2.5-flash` itself already 404s despite still being listed by `models.list()`). */
const DEFAULT_MODEL = 'gemini-flash-latest';

export class EmptyGeminiResponseError extends Error {
  constructor() {
    super('Gemini returned an empty response for the test-generation prompt.');
    this.name = 'EmptyGeminiResponseError';
  }
}

/**
 * The real adapter for the `JestTestGenerator` port (see docs/adr/0024) —
 * the one place in this platform that calls an external LLM, by explicit
 * user decision (chosen over rule-based scaffolding, which can't infer
 * meaningful assertions from a signature alone). Everything upstream of
 * this class (packages/unit-test-engine, packages/application) depends
 * only on the port, never on `@google/genai` directly.
 */
export class GeminiJestTestGenerator implements JestTestGenerator {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateTests(input: GenerateTestsInput): Promise<GeneratedTestCode> {
    const prompt = buildPrompt(input);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });
    const text = response.text;
    if (!text || text.trim().length === 0) {
      throw new EmptyGeminiResponseError();
    }
    return { content: extractCode(text) };
  }
}
