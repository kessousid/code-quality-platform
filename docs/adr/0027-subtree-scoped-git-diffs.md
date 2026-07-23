# ADR-0027: Subtree-scoped git diffs for nested repo roots

## Status

Accepted

## Context

A repo record's `localPath` was assumed to always be a git top-level
directory. In practice, users pointed `localPath` at a subdirectory of a
larger checkout (e.g. an `assessment/` folder, or `assessment/src`
inside it, nested inside a bigger git working tree that has only one
`.git` at its true root).

`computeChangedFiles` and `computeChangedLinesFromWorkingTree`
(`@cqp/scan-engine`) ran `git diff`/`git rev-parse` with `cwd: repoRoot`
and no pathspec restriction. Git resolves `cwd` up to the nearest `.git`
regardless of which subdirectory it's invoked from, and reports diff
paths relative to that true top-level — so a coverage-gate or
incremental-scan run against a nested `localPath` silently diffed the
**entire enclosing repository**, not the subtree the user pointed at.
Downstream, `computeCoverageFileResults` (`@cqp/coverage-engine`) joins
those root-relative paths onto `repoRoot` to locate files on disk — when
`repoRoot` is a subtree, that join produces a path that doesn't exist,
so every reported "changed" file silently reads as having zero coverage
(no matching entry in Istanbul's report), regardless of what tests
actually exist.

This surfaced as: a repo pointed at `.../gitlab_test_project/assessment/src`
returning coverage-gate results for `math.js`/`strings.js` — files that
live at the enclosing repo's true root, not anywhere under that subtree.

## Decision

`repoRoot` may be a subdirectory of a larger git working tree, not just
its top-level. Two functions in `@cqp/scan-engine` were made
subtree-aware:

1. **Scope the diff**: append a `-- .` pathspec. Git resolves
   command-line pathspecs relative to `cwd`, so running with
   `cwd: repoRoot` restricts the diff to `repoRoot`'s own subtree even
   though git's actual root is higher up — no change needed to how the
   commands locate the repository itself.
2. **Translate paths back**: git still reports diff paths relative to
   the true top-level, not `cwd`. `git rev-parse --show-prefix` (also
   run with `cwd: repoRoot`) returns exactly the segment to strip (e.g.
   `"assessment/src/"`, or `""` when `repoRoot` already is the
   top-level) to turn those back into `repoRoot`-relative paths — which
   is what every downstream consumer (`join(repoRoot, relPath)` in
   `computeCoverageFileResults`, `discoverSourceFiles`, etc.) already
   assumes.

`parseUnifiedDiffHunks` takes an optional `pathPrefix` parameter
(default `''`) to do the stripping, keeping it a pure function testable
against hand-written diff text with no real git involved, and leaving
existing callers/tests that pass no prefix unaffected.

`verifyRefExists` is untouched — ref resolution (`main`, `HEAD`, etc.)
is inherently repo-wide; there's no meaningful per-subtree scoping to
apply there, and a nested `localPath`'s "main" branch correctly refers
to the same branch the enclosing repo uses.

### Tradeoff, stated up front

Multiple repo records pointing at different subtrees of the _same_
underlying git repository now each correctly see only their own
subtree's changes — but they still share one git history/ref
namespace. `baseRef` resolution, branch existence, and commit ancestry
are still repo-wide; only the _file-scope_ of the diff is narrowed.
Two repo records for sibling subtrees of one checkout are not
equivalent to two independent repos with independent histories.

## Consequences

- Existing repo records whose `localPath` already was a true git
  top-level are unaffected: `git rev-parse --show-prefix` returns `""`
  there, so the pathspec (`-- .` matching everything at the root) and
  prefix-stripping (a no-op) both degrade to prior behavior exactly.
- `computeChangedFiles` (used by `run-scan.use-case.ts` for incremental
  security scans) got the same fix for consistency — the identical bug
  class applied there too, just undiscovered until the coverage-gate
  case surfaced it.
