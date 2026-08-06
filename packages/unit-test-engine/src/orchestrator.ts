import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type {
  GeneratedTestFile,
  JestTestGenerator,
  TestCaseResult,
  TestGeneratorType,
  UnitTestTarget,
} from '@cqp/core';
import { discoverSourceFiles } from './discover-files.js';
import { extractExportedFunctions, languageFromPath } from './extract-functions.js';
import { runJest } from './run-jest.js';
import { writeLocalExecutionReport } from './local-execution-report.js';

export type UnitTestProgressEvent =
  | { type: 'total'; total: number }
  | { type: 'file-start'; filePath: string }
  | { type: 'file-finish'; filePath: string };

export interface RunUnitTestGenerationOptions {
  onProgress?: (event: UnitTestProgressEvent) => void;
  signal?: AbortSignal;
}

export interface UnitTestGenerationResult {
  generatedFiles: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[];
  testResults: Omit<TestCaseResult, 'id' | 'runId'>[];
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
}

/**
 * Every run's output — generated tests and the local execution report —
 * lives under this one consolidated tree, segmented by generator type
 * (see docs/adr/0038), rather than scattered next to each source file as
 * before. `discoverSourceFiles` skips this whole tree (discover-files.ts's
 * `EXCLUDED_DIR_NAMES`), so a generated test is never mistaken for a new
 * source file to generate a test FOR.
 */
export const UNIT_TESTS_ROOT_DIR = 'Unit tests';

function generatorBaseDir(generatorType: TestGeneratorType): string {
  const folder = generatorType === 'gemini' ? 'AI Based' : 'Script based';
  return join(UNIT_TESTS_ROOT_DIR, folder);
}

/** Mirrors the source's own relative path under the generator's base dir — still purely orchestrator-computed, never trusted from the LLM (see docs/adr/0024's `GeneratedTestCode` port comment). */
function testFilePathFor(sourceRelativePath: string): string {
  const ext = extname(sourceRelativePath);
  const withoutExt = sourceRelativePath.slice(0, -ext.length);
  return `${withoutExt}.generated.test${ext}`;
}

interface GenerateOneFileResult {
  generatedFile: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>;
  testAbsolutePath: string;
}

/** One discovered file's full generate-and-write step — pulled out purely to keep runUnitTestGeneration's own branching count down. */
async function generateAndWriteTestFor(
  repoRoot: string,
  baseDir: string,
  file: { absolutePath: string; relativePath: string },
  sourceCode: string,
  functions: ReturnType<typeof extractExportedFunctions>,
  generator: JestTestGenerator,
  functionName: string | undefined,
): Promise<GenerateOneFileResult> {
  const generated = await generator.generateTests({
    sourceFilePath: file.relativePath,
    sourceCode,
    language: languageFromPath(file.relativePath),
    functions,
    sourceFileAbsolutePath: file.absolutePath,
  });

  const testRelativePath = join(baseDir, testFilePathFor(file.relativePath));
  const testAbsolutePath = join(repoRoot, testRelativePath);
  await mkdir(dirname(testAbsolutePath), { recursive: true });
  await writeFile(testAbsolutePath, generated.content, 'utf-8');

  return {
    generatedFile: {
      sourceFilePath: file.relativePath,
      testFilePath: testRelativePath,
      ...(functionName !== undefined ? { functionName } : {}),
    },
    testAbsolutePath,
  };
}

async function runJestOrEmpty(
  repoRoot: string,
  generatedFiles: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[],
  generatedAbsolutePaths: string[],
  aborted: boolean,
): Promise<UnitTestGenerationResult> {
  if (aborted || generatedAbsolutePaths.length === 0) {
    return { generatedFiles, testResults: [], testsTotal: 0, testsPassed: 0, testsFailed: 0 };
  }
  const jestResult = await runJest(repoRoot, generatedAbsolutePaths);
  return {
    generatedFiles,
    testResults: jestResult.results,
    testsTotal: jestResult.testsTotal,
    testsPassed: jestResult.testsPassed,
    testsFailed: jestResult.testsFailed,
  };
}

/**
 * Discovers target files -> extracts exported function signatures per
 * file (skipping files with none) -> calls the injected `JestTestGenerator`
 * once per file -> writes the result to disk -> runs jest once across
 * every generated file -> returns the normalized report. Mirrors
 * scan-engine's runScan shape (progress events, AbortSignal) on purpose —
 * see docs/adr/0023/0024.
 */
export async function runUnitTestGeneration(
  repoRoot: string,
  target: UnitTestTarget,
  generatorType: TestGeneratorType,
  generator: JestTestGenerator,
  options: RunUnitTestGenerationOptions = {},
): Promise<UnitTestGenerationResult> {
  const files = await discoverSourceFiles(repoRoot, target.path);

  if (target.functionName !== undefined && files.length !== 1) {
    throw new Error(
      'A specific function target requires the path to point at a single file, not a directory.',
    );
  }

  const baseDir = generatorBaseDir(generatorType);
  const targetOutputAbsoluteDir = join(repoRoot, baseDir, target.path);
  // Per the user: re-running on the same target overrides what an earlier
  // run left there (including output for a source file since renamed or
  // deleted) rather than accumulating stale files alongside the new run's.
  await rm(targetOutputAbsoluteDir, { recursive: true, force: true });

  options.onProgress?.({ type: 'total', total: files.length });

  const generatedFiles: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[] = [];
  const generatedAbsolutePaths: string[] = [];

  for (const file of files) {
    if (options.signal?.aborted) break;
    options.onProgress?.({ type: 'file-start', filePath: file.relativePath });

    const sourceCode = await readFile(file.absolutePath, 'utf-8');
    const functions = extractExportedFunctions(sourceCode, file.relativePath, target.functionName);

    if (functions.length > 0) {
      const { generatedFile, testAbsolutePath } = await generateAndWriteTestFor(
        repoRoot,
        baseDir,
        file,
        sourceCode,
        functions,
        generator,
        target.functionName,
      );
      generatedFiles.push(generatedFile);
      generatedAbsolutePaths.push(testAbsolutePath);
    }

    options.onProgress?.({ type: 'file-finish', filePath: file.relativePath });
  }

  const result = await runJestOrEmpty(
    repoRoot,
    generatedFiles,
    generatedAbsolutePaths,
    options.signal?.aborted ?? false,
  );

  // Written even for a zero-file/aborted-before-jest run, since the clear
  // step above just deleted whatever report an earlier run against this
  // same target left — leaving nothing behind would be more confusing than
  // a report that honestly says nothing ran.
  if (!options.signal?.aborted) {
    await writeLocalExecutionReport(targetOutputAbsoluteDir, {
      generator: generatorType,
      target,
      generatedAt: new Date().toISOString(),
      testsTotal: result.testsTotal,
      testsPassed: result.testsPassed,
      testsFailed: result.testsFailed,
      testResults: result.testResults,
    });
  }

  return result;
}
