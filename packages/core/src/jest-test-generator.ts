/**
 * Port for the LLM-backed test-writing step (see docs/adr/0024) — the one
 * piece of this module that genuinely can't be rule-based, unlike the
 * rest of the platform (ADR-0020). Framework-free here on purpose:
 * packages/gemini-test-generator implements this against the real Gemini
 * API; packages/application's tests use an in-memory fake, the same way
 * they use in-memory repositories instead of real Postgres.
 */

export type SourceLanguage = 'ts' | 'tsx' | 'js' | 'jsx';

/**
 * Which implementation of `JestTestGenerator` a run should use (see
 * docs/adr/0026) — `'gemini'` is the only real LLM today, but this is a
 * union specifically so adding another provider later is "register
 * another generator," not a redesign. `'script'` is the deterministic,
 * zero-LLM alternative: real execution, no guessing at expected values.
 */
export type TestGeneratorType = 'gemini' | 'script';

/** One exported function/const-arrow-function the orchestrator found via static analysis (packages/unit-test-engine) and decided to generate a test for. */
export interface FunctionSignature {
  name: string;
  isDefaultExport: boolean;
  isAsync: boolean;
  /** The function's full declaration + body, as written in the source file — the LLM's only real context beyond the surrounding file. */
  sourceText: string;
  /** Parameter names as written (a destructured param like `{ id, name }` is captured as one opaque entry) — used by the script generator to synthesize call arguments; the LLM generator ignores this. */
  parameters: string[];
}

export interface GenerateTestsInput {
  /** Relative to the repo root — used only for the import path inside the generated test, never trusted as a filesystem write target. */
  sourceFilePath: string;
  sourceCode: string;
  language: SourceLanguage;
  functions: FunctionSignature[];
  /** Absolute path on disk, for a generator that needs to actually `require()` the real file (the script generator) — the LLM generator ignores this. */
  sourceFileAbsolutePath?: string;
}

export interface GeneratedTestCode {
  /** A complete, self-contained Jest test file body — imports, describe/it blocks, real assertions. */
  content: string;
}

export interface JestTestGenerator {
  generateTests(input: GenerateTestsInput): Promise<GeneratedTestCode>;
}
