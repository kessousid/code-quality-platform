import { posix } from 'node:path';

/**
 * Matches a relative module specifier (starting `./` or `../`) right
 * after one of the keywords a generated test could plausibly use to
 * reference another file. `path.posix` is used throughout (not the
 * OS-native `path`) so this behaves identically on the Linux worker
 * Railway runs and a developer's own Windows/macOS worker — a generated
 * test's import strings are always forward-slash, regardless of host OS.
 */
const RELATIVE_IMPORT_PATTERN =
  /(\bfrom\s+|\brequire\(\s*|\bimport\(\s*|\bjest\.mock\(\s*|\bjest\.requireActual\(\s*|\bjest\.requireMock\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

/**
 * Both `JestTestGenerator` implementations write relative imports as if
 * the generated test sat directly next to the source file — the
 * simplest, most reliable contract for a generator (an LLM naturally
 * copies a sibling import like `../utils/x` verbatim from what it reads
 * in the source, rather than being trusted to redo the path arithmetic
 * for wherever the file will actually land).
 *
 * The real output location is the mirrored `Unit tests/<generator>/...`
 * tree (docs/adr/0038), which nests every test exactly as deep as the
 * source file's own directory — so a "same directory as source" import
 * like `./health.controller` or `../utils/catchAsync` no longer resolves
 * from there. This rewrites every such specifier to the path that's
 * actually correct from the real output directory, deterministically —
 * not by asking the generator (or an LLM) to get the arithmetic right.
 */
export function rewriteRelativeImportsForOutputLocation(
  content: string,
  sourceDirRelative: string,
  testDirRelative: string,
): string {
  return content.replace(
    RELATIVE_IMPORT_PATTERN,
    (_match, prefix: string, quote: string, spec: string) => {
      const resolvedFromRepoRoot = posix.normalize(posix.join(sourceDirRelative, spec));
      let rewritten = posix.relative(testDirRelative, resolvedFromRepoRoot);
      if (rewritten === '') {
        rewritten = '.';
      }
      if (!rewritten.startsWith('.')) {
        rewritten = `./${rewritten}`;
      }
      return `${prefix}${quote}${rewritten}${quote}`;
    },
  );
}
