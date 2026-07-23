import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type {
  GeneratedTestFile,
  JestTestGenerator,
  TestCaseResult,
  UnitTestTarget,
} from '@cqp/core';
import { discoverSourceFiles } from './discover-files.js';
import { extractExportedFunctions, languageFromPath } from './extract-functions.js';
import { runJest } from './run-jest.js';

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

/** Always alongside the source, never trusted from the LLM (see docs/adr/0024's `GeneratedTestCode` port comment). */
function testFilePathFor(sourceRelativePath: string): string {
  const ext = extname(sourceRelativePath);
  const withoutExt = sourceRelativePath.slice(0, -ext.length);
  return `${withoutExt}.generated.test${ext}`;
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
  generator: JestTestGenerator,
  options: RunUnitTestGenerationOptions = {},
): Promise<UnitTestGenerationResult> {
  const files = await discoverSourceFiles(repoRoot, target.path);

  if (target.functionName !== undefined && files.length !== 1) {
    throw new Error(
      'A specific function target requires the path to point at a single file, not a directory.',
    );
  }

  options.onProgress?.({ type: 'total', total: files.length });

  const generatedFiles: Omit<GeneratedTestFile, 'id' | 'runId' | 'createdAt'>[] = [];
  const generatedAbsolutePaths: string[] = [];

  for (const file of files) {
    if (options.signal?.aborted) break;
    options.onProgress?.({ type: 'file-start', filePath: file.relativePath });

    const sourceCode = await readFile(file.absolutePath, 'utf-8');
    const functions = extractExportedFunctions(sourceCode, file.relativePath, target.functionName);

    if (functions.length > 0) {
      const generated = await generator.generateTests({
        sourceFilePath: file.relativePath,
        sourceCode,
        language: languageFromPath(file.relativePath),
        functions,
        sourceFileAbsolutePath: file.absolutePath,
      });

      const testRelativePath = testFilePathFor(file.relativePath);
      const testAbsolutePath = join(repoRoot, testRelativePath);
      await mkdir(dirname(testAbsolutePath), { recursive: true });
      await writeFile(testAbsolutePath, generated.content, 'utf-8');

      generatedFiles.push({
        sourceFilePath: file.relativePath,
        testFilePath: testRelativePath,
        ...(target.functionName !== undefined ? { functionName: target.functionName } : {}),
      });
      generatedAbsolutePaths.push(testAbsolutePath);
    }

    options.onProgress?.({ type: 'file-finish', filePath: file.relativePath });
  }

  if (options.signal?.aborted || generatedAbsolutePaths.length === 0) {
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
