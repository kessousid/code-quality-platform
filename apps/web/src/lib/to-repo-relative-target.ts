/**
 * Converts a browsed absolute path down to a path relative to the repo root, for submission to the
 * unit-test-run API (see GenerateUnitTestsSection — the field itself shows the real absolute path while
 * browsing, since a cryptic '.' or blank-looking empty string would be worse there).
 *
 * Both sides are stripped of a trailing slash before comparing: `localPath` may have been typed by hand at
 * repo-creation time (e.g. pasted from an Explorer address bar, which often includes a trailing "\"), while
 * the browse picker's paths never do (they come from node:path's `resolve()`, which always strips one). A
 * real incident: this exact mismatch made a plain `startsWith` check silently fail, falling through to
 * submitting the full absolute path as the "relative" target, which then hit `discoverSourceFiles`'s
 * `join(repoRoot, targetPath)` and produced a doubled, nonexistent path (`TargetNotFoundError`).
 */
export function toRepoRelativeTarget(path: string, localPath: string | undefined): string {
  if (!localPath) return path;
  const stripTrailingSlash = (p: string) => p.replace(/[/\\]+$/, '');
  const normalizedPath = stripTrailingSlash(path);
  const normalizedLocal = stripTrailingSlash(localPath);
  if (normalizedPath === normalizedLocal) return '.';
  return normalizedPath.startsWith(normalizedLocal)
    ? normalizedPath.slice(normalizedLocal.length).replace(/^[/\\]/, '')
    : path;
}
