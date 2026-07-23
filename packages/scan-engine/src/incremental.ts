import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * `repoRoot` need not be a git top-level — it may be a subdirectory of a
 * larger checkout (docs/adr/0027). `git rev-parse --show-prefix` (cwd =
 * repoRoot) returns the path from the real top-level down to `repoRoot`
 * (e.g. `"assessment/src/"`, or `""` when `repoRoot` IS the top-level) —
 * used both to scope diffs to just this subtree via a `.` pathspec (which
 * git resolves relative to cwd) and to strip back to `repoRoot`-relative
 * paths afterward, since git always reports diff paths relative to the
 * true top-level regardless of cwd or pathspec.
 */
async function getGitPathPrefix(repoRoot: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-prefix'], { cwd: repoRoot });
  return stdout.trim();
}

function stripGitPrefix(path: string, prefix: string): string {
  return prefix.length > 0 && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Real `git diff`, not a reimplementation (see docs/adr/0018). Requires
 * `repoRoot` to be an actual git checkout with both refs reachable
 * locally — a precondition the caller is responsible for. Scoped to
 * `repoRoot`'s own subtree (docs/adr/0027) — the `-- .` pathspec is
 * resolved by git relative to `cwd`, so it restricts the diff even when
 * `repoRoot` is nested inside a larger repo.
 */
export async function computeChangedFiles(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): Promise<string[]> {
  const prefix = await getGitPathPrefix(repoRoot);
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--name-only', `${baseRef}..${headRef}`, '--', '.'],
    {
      cwd: repoRoot,
    },
  );

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => stripGitPrefix(line, prefix));
}

/**
 * `git rev-parse --verify` exits non-zero (throws for execFile) when `ref`
 * doesn't resolve locally — used to validate a coverage gate's base ref
 * upfront, at run-creation time, rather than discovering it's unresolvable
 * mid-run (docs/adr/0025).
 */
export async function verifyRefExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--verify', ref], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parses `git diff --unified=0` output into a map of relative file path ->
 * changed line numbers in the NEW (working-tree) version. Pure, no I/O —
 * exported so it can be unit-tested against hand-written diff text without
 * touching git at all. Deleted files (`+++ /dev/null`) and pure-deletion
 * hunks (`+c,0`) contribute no lines, since there's nothing left to cover.
 *
 * `pathPrefix` (docs/adr/0027) strips the leading `git rev-parse
 * --show-prefix` segment so keys come back relative to `repoRoot` even
 * when `repoRoot` is a subdirectory of the real git top-level — defaults
 * to `''` (no stripping) so hand-written diffs in tests are unaffected.
 */
export function parseUnifiedDiffHunks(
  diffOutput: string,
  pathPrefix = '',
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  const fileChunks = diffOutput.split(/^diff --git .+$/m).slice(1);

  for (const chunk of fileChunks) {
    const newFileMatch = chunk.match(/^\+\+\+ (.+)$/m);
    if (!newFileMatch || newFileMatch[1] === '/dev/null') continue; // deleted file — nothing left to cover

    const path = stripGitPrefix(newFileMatch[1]!.replace(/^b\//, ''), pathPrefix);
    const lines = new Set<number>();

    for (const line of chunk.split('\n')) {
      const hunk = HUNK_HEADER.exec(line);
      if (!hunk) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] !== undefined ? Number(hunk[2]) : 1;
      if (count === 0) continue; // pure-deletion hunk at this position — no new lines added
      for (let l = start; l < start + count; l++) lines.add(l);
    }

    if (lines.size > 0) {
      result[path] = [...lines].sort((a, b) => a - b);
    }
  }

  return result;
}

/**
 * Diffs the working tree (including uncommitted/staged edits) against
 * `baseRef` — deliberately NOT `baseRef..HEAD`, since a developer runs the
 * coverage gate mid-change, before committing everything (docs/adr/0025).
 * `--unified=0` makes each hunk's `+c,d` range exactly the changed lines,
 * with no surrounding context to filter out. Scoped to `repoRoot`'s own
 * subtree via a `.` pathspec, and results are translated back to
 * `repoRoot`-relative paths (docs/adr/0027) — see `getGitPathPrefix`.
 *
 * Note: plain `git diff` only covers tracked files — a brand-new file that
 * hasn't been `git add`ed yet won't appear here. Out of scope for this pass;
 * would need a separate `git ls-files --others --exclude-standard` pass to
 * include wholly-untracked files if that turns out to matter in practice.
 */
export async function computeChangedLinesFromWorkingTree(
  repoRoot: string,
  baseRef: string,
): Promise<Record<string, number[]>> {
  const prefix = await getGitPathPrefix(repoRoot);
  const { stdout } = await execFileAsync('git', ['diff', '--unified=0', baseRef, '--', '.'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 32,
  });

  return parseUnifiedDiffHunks(stdout, prefix);
}
