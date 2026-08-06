import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FakeJestTestGenerator,
  InMemoryGeneratedTestFileRepository,
  InMemoryRepoRepository,
  InMemoryTestCaseResultRepository,
  InMemoryUnitTestRunRepository,
} from './testing/index.js';
import { RunUnitTestGenerationUseCase } from './run-unit-test-generation.use-case.js';

/**
 * Real end to end, same philosophy as run-scan.use-case.spec.ts (docs/adr/0021):
 * a real TypeScript AST parse, a real generated file written to disk, and
 * real jest execution — only the LLM call is faked (see FakeJestTestGenerator's
 * own doc comment for why that specific piece, and only that piece, isn't real here).
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** jest is a transitive devDependency of @cqp/unit-test-engine, not this package — resolve through it directly. */
function findRealJestPath(): string {
  return join(packageRoot, '..', 'unit-test-engine', 'node_modules', 'jest', 'bin', 'jest.js');
}

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const unitTestRunRepository = new InMemoryUnitTestRunRepository();
  const generatedTestFileRepository = new InMemoryGeneratedTestFileRepository();
  const testCaseResultRepository = new InMemoryTestCaseResultRepository();
  // Distinct fakes per registry key (docs/adr/0026) so tests can confirm the right one gets picked per run.generator.
  const generator = new FakeJestTestGenerator();
  const scriptGenerator = new FakeJestTestGenerator();

  const useCase = new RunUnitTestGenerationUseCase(
    unitTestRunRepository,
    repoRepository,
    generatedTestFileRepository,
    testCaseResultRepository,
    { gemini: generator, script: scriptGenerator },
  );

  return {
    repoRepository,
    unitTestRunRepository,
    generatedTestFileRepository,
    testCaseResultRepository,
    generator,
    scriptGenerator,
    useCase,
  };
}

describe('RunUnitTestGenerationUseCase', () => {
  let repoRoot: string;
  const originalJestPath = process.env.CQP_JEST_PATH;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'cqp-unit-test-run-'));
    process.env.CQP_JEST_PATH = findRealJestPath();
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

  it('generates a real test file, runs it for real, and persists results + summary', async () => {
    const {
      repoRepository,
      unitTestRunRepository,
      generatedTestFileRepository,
      testCaseResultRepository,
      useCase,
    } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });
    await writeFile(
      join(repoRoot, 'greet.js'),
      `export function greet(name) { return 'hello ' + name; }`,
    );

    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'greet.js' },
    });
    await useCase.execute('org_1', run.id);

    const completed = await unitTestRunRepository.findById('org_1', run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.testsTotal).toBe(1);
    expect(completed?.testsPassed).toBe(1);
    expect(completed?.filesTotal).toBe(1);
    expect(completed?.filesCompleted).toBe(1);

    const files = await generatedTestFileRepository.listByRun(run.id);
    expect(files).toHaveLength(1);
    expect(files[0]?.testFilePath).toBe(join('Unit tests', 'AI Based', 'greet.generated.test.js'));

    const results = await testCaseResultRepository.listByRun(run.id);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('passed');

    // docs/adr/0038 — a local execution report lands alongside the generated test.
    const report = JSON.parse(
      await readFile(
        join(repoRoot, 'Unit tests', 'AI Based', 'greet.js', 'execution report', 'report.json'),
        'utf-8',
      ),
    );
    expect(report.testsTotal).toBe(1);
    expect(report.testsPassed).toBe(1);
  }, 30000);

  it('uses the script generator, not gemini, when the run requests it', async () => {
    const { repoRepository, unitTestRunRepository, generator, scriptGenerator, useCase } =
      await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });
    await writeFile(
      join(repoRoot, 'greet.js'),
      `export function greet(name) { return 'hello ' + name; }`,
    );

    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'greet.js' },
      generator: 'script',
    });
    await useCase.execute('org_1', run.id);

    expect(scriptGenerator.calls).toHaveLength(1);
    expect(generator.calls).toHaveLength(0);
  }, 30000);

  it('rejects an unknown runId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-run')).rejects.toThrow('UnitTestRun not found');
  });

  it('rejects an unknown repoId', async () => {
    const { unitTestRunRepository, useCase } = await setUp();
    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: 'no-such-repo',
      target: { path: 'x.ts' },
    });
    await expect(useCase.execute('org_1', run.id)).rejects.toThrow('Repo not found');
  });

  it('fails clearly when the repo has no local checkout', async () => {
    const { repoRepository, unitTestRunRepository, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' });
    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: 'x.ts' },
    });

    await expect(useCase.execute('org_1', run.id)).rejects.toThrow('no local checkout');

    const failed = await unitTestRunRepository.findById('org_1', run.id);
    expect(failed?.status).toBe('failed');
  });

  it('never starts a run that was already cancelled while queued', async () => {
    const { repoRepository, unitTestRunRepository, generator, useCase } = await setUp();
    const repo = await repoRepository.create({ orgId: 'org_1', name: 'demo', localPath: repoRoot });
    const run = await unitTestRunRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      target: { path: '.' },
    });
    await unitTestRunRepository.updateStatus('org_1', run.id, 'cancelled');

    await useCase.execute('org_1', run.id);

    expect(generator.calls).toHaveLength(0);
    const stillCancelled = await unitTestRunRepository.findById('org_1', run.id);
    expect(stillCancelled?.status).toBe('cancelled');
  });
});
