import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeChangedFiles,
  computeChangedLinesFromWorkingTree,
  parseUnifiedDiffHunks,
  verifyRefExists,
} from './incremental.js';

const execFileAsync = promisify(execFile);

/** No mocking — creates a real throwaway git repo with two real commits and diffs them. */
describe('computeChangedFiles', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'cqp-incremental-'));
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoDir });

    await git('init', '--quiet');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');

    await writeFile(join(repoDir, 'unchanged.txt'), 'stays the same\n');
    await writeFile(join(repoDir, 'to-be-changed.txt'), 'original\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'base commit');

    await writeFile(join(repoDir, 'to-be-changed.txt'), 'modified\n');
    await writeFile(join(repoDir, 'new-file.txt'), 'brand new\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'second commit');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('lists exactly the files that changed between two real commits', async () => {
    const changed = await computeChangedFiles(repoDir, 'HEAD~1', 'HEAD');

    expect(changed.sort()).toEqual(['new-file.txt', 'to-be-changed.txt']);
    expect(changed).not.toContain('unchanged.txt');
  });

  it('scopes to a subdirectory when repoRoot is nested inside a larger repo, returning subtree-relative paths (docs/adr/0027)', async () => {
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoDir });
    await writeFile(join(repoDir, 'outside-root.txt'), 'sibling change, not under sub/\n');
    const subDir = join(repoDir, 'sub');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, 'inside.txt'), 'original\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'third commit');

    await writeFile(join(repoDir, 'outside-root.txt'), 'changed outside sub/\n');
    await writeFile(join(subDir, 'inside.txt'), 'changed inside sub/\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'fourth commit');

    const changed = await computeChangedFiles(subDir, 'HEAD~1', 'HEAD');

    expect(changed).toEqual(['inside.txt']);
    expect(changed).not.toContain('outside-root.txt');
    expect(changed).not.toContain('sub/inside.txt');
  });
});

describe('verifyRefExists', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'cqp-verify-ref-'));
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoDir });
    await git('init', '--quiet');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');
    await writeFile(join(repoDir, 'a.txt'), 'a\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'base');
    await git('branch', 'main');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('resolves a real branch/ref', async () => {
    expect(await verifyRefExists(repoDir, 'main')).toBe(true);
    expect(await verifyRefExists(repoDir, 'HEAD')).toBe(true);
  });

  it('does not resolve a ref that does not exist', async () => {
    expect(await verifyRefExists(repoDir, 'no-such-branch')).toBe(false);
  });
});

describe('parseUnifiedDiffHunks', () => {
  it('collects added/modified line numbers per file from a hand-written unified=0 diff', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3,0 +4 @@',
      '+added single line',
      '@@ -10,0 +12,2 @@',
      '+added line one',
      '+added line two',
      '',
    ].join('\n');

    expect(parseUnifiedDiffHunks(diff)).toEqual({ 'src/a.ts': [4, 12, 13] });
  });

  it('excludes deleted files and pure-deletion hunks', () => {
    const diff = [
      'diff --git a/removed.ts b/removed.ts',
      '--- a/removed.ts',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-gone',
      'diff --git a/kept.ts b/kept.ts',
      '--- a/kept.ts',
      '+++ b/kept.ts',
      '@@ -5,2 +5,0 @@',
      '-removed only, no new lines',
      '',
    ].join('\n');

    expect(parseUnifiedDiffHunks(diff)).toEqual({});
  });

  it('handles a brand-new file (hunk starting at line 1)', () => {
    const diff = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,3 @@',
      '+line one',
      '+line two',
      '+line three',
      '',
    ].join('\n');

    expect(parseUnifiedDiffHunks(diff)).toEqual({ 'new.ts': [1, 2, 3] });
  });
});

describe('computeChangedLinesFromWorkingTree', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'cqp-changed-lines-'));
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoDir });

    await git('init', '--quiet');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');

    await writeFile(join(repoDir, 'math.ts'), 'export function add(a, b) {\n  return a + b;\n}\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'base commit');
    await git('branch', 'main');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('includes uncommitted working-tree edits, not just committed changes', async () => {
    // Deliberately NOT committed — this is the whole point of diffing against the working tree.
    await writeFile(
      repoDir + '/math.ts',
      'export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n',
    );

    const changed = await computeChangedLinesFromWorkingTree(repoDir, 'main');

    expect(changed['math.ts']).toEqual([4, 5, 6, 7]);
  });

  it('returns no changes when the working tree matches the base ref', async () => {
    const changed = await computeChangedLinesFromWorkingTree(repoDir, 'main');
    expect(changed).toEqual({});
  });

  it('scopes to a subdirectory when repoRoot is nested inside a larger repo, returning subtree-relative keys (docs/adr/0027)', async () => {
    const git = (...args: string[]) => execFileAsync('git', args, { cwd: repoDir });
    const subDir = join(repoDir, 'assessment', 'src');
    await mkdir(subDir, { recursive: true });

    // A brand-new file needs `git add` to show up in a plain `git diff` at all (see the caveat above).
    await writeFile(join(subDir, 'strings.ts'), 'export function shout(s) {\n  return s;\n}\n');
    await git('add', '.');

    // An uncommitted edit to an already-tracked file OUTSIDE the subtree — must not leak into a subtree-scoped diff.
    await writeFile(
      repoDir + '/math.ts',
      'export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n',
    );

    const changed = await computeChangedLinesFromWorkingTree(subDir, 'main');

    expect(changed).toEqual({ 'strings.ts': [1, 2, 3] });
    expect(changed).not.toHaveProperty('math.ts');
    expect(changed).not.toHaveProperty('assessment/src/strings.ts');
  });
});
