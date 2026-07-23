/**
 * A unit-test run's `target.path` is literally `'.'` when the whole repo root was picked (see
 * GenerateUnitTestsSection's toRepoRelativeTarget) — a bare period reads as blank/broken wherever it's
 * displayed, so every display site should go through this instead of rendering `target.path` raw.
 */
export function formatTargetPath(path: string): string {
  return path === '.' ? 'whole repo' : path;
}
