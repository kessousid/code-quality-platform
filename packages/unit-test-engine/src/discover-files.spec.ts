import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSourceFiles, TargetNotFoundError } from './discover-files.js';

async function withTempRepo(fn: (repoRoot: string) => Promise<void>): Promise<void> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'cqp-discover-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

describe('discoverSourceFiles', () => {
  it('returns exactly one file when the target is a file', async () => {
    await withTempRepo(async (repoRoot) => {
      await writeFile(join(repoRoot, 'foo.ts'), 'export const x = 1;');
      const files = await discoverSourceFiles(repoRoot, 'foo.ts');
      expect(files).toEqual([{ absolutePath: join(repoRoot, 'foo.ts'), relativePath: 'foo.ts' }]);
    });
  });

  it('walks a directory, skips node_modules and existing test files', async () => {
    await withTempRepo(async (repoRoot) => {
      await mkdir(join(repoRoot, 'src', 'node_modules', 'dep'), { recursive: true });
      await writeFile(join(repoRoot, 'src', 'node_modules', 'dep', 'index.js'), '');
      await writeFile(join(repoRoot, 'src', 'a.ts'), 'export const a = 1;');
      await writeFile(join(repoRoot, 'src', 'a.test.ts'), 'test.skip("x", () => {});');
      await writeFile(join(repoRoot, 'src', 'a.generated.test.ts'), '// stale from a prior run');
      await writeFile(join(repoRoot, 'src', 'README.md'), '# not source');

      const files = await discoverSourceFiles(repoRoot, 'src');
      expect(files.map((f) => f.relativePath)).toEqual(['src/a.ts']);
    });
  });

  it('skips the Unit tests output tree entirely (docs/adr/0038), not just files matching the generated-test filename pattern', async () => {
    await withTempRepo(async (repoRoot) => {
      await mkdir(join(repoRoot, 'Unit tests', 'AI Based', 'execution report'), {
        recursive: true,
      });
      await writeFile(
        join(repoRoot, 'Unit tests', 'AI Based', 'a.generated.test.ts'),
        '// stale from a prior run',
      );
      await writeFile(
        join(repoRoot, 'Unit tests', 'AI Based', 'execution report', 'report.json'),
        '{}',
      );
      await writeFile(join(repoRoot, 'src.ts'), 'export const x = 1;');

      const files = await discoverSourceFiles(repoRoot, '.');
      expect(files.map((f) => f.relativePath)).toEqual(['src.ts']);
    });
  });

  it('throws a clear error for a target that does not exist', async () => {
    await withTempRepo(async (repoRoot) => {
      await expect(discoverSourceFiles(repoRoot, 'nope')).rejects.toThrow(TargetNotFoundError);
    });
  });

  it('caps discovery at MAX_DISCOVERED_FILES so a huge folder cannot run away (see docs/adr/0023)', async () => {
    await withTempRepo(async (repoRoot) => {
      for (let i = 0; i < 20; i++) {
        await writeFile(join(repoRoot, `file${i}.ts`), `export const v${i} = ${i};`);
      }
      const files = await discoverSourceFiles(repoRoot, '.');
      expect(files.length).toBeLessThanOrEqual(15);
    });
  });
});
