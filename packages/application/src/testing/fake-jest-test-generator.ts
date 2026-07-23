import type { GenerateTestsInput, GeneratedTestCode, JestTestGenerator } from '@cqp/core';

/**
 * A deterministic stand-in for the real Gemini-backed generator (see
 * docs/adr/0024) — this platform's automated test suite treats the paid
 * external LLM API the same way it treats Postgres/Redis: real end to
 * end, but faked in the fast, free, CI-style test run. Produces a
 * trivially-true test so callers can still exercise real jest execution
 * without a network call.
 */
export class FakeJestTestGenerator implements JestTestGenerator {
  public readonly calls: GenerateTestsInput[] = [];

  async generateTests(input: GenerateTestsInput): Promise<GeneratedTestCode> {
    this.calls.push(input);
    const fn = input.functions[0]!;
    return {
      content: `describe('${fn.name}', () => {
  it('was found by generation', () => {
    expect('${fn.name}').toBe('${fn.name}');
  });
});
`,
    };
  }
}
