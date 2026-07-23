/**
 * See docs/adr/0017-external-tool-resolution.md: env var override, then a
 * bare command name for PATH resolution.
 *
 * On Windows, `child_process.spawn()` without `shell: true` calls
 * `CreateProcess` directly, which does NOT do the `PATHEXT` extension
 * resolution `cmd.exe` does — a bare "semgrep" fails with ENOENT even
 * though `semgrep.exe` is on PATH. Deliberately not fixing this with
 * `shell: true` instead: Windows shell invocation of `.bat`/`.cmd` files
 * has its own real CVE history (e.g. CVE-2024-27980) for argument
 * injection. The tools this resolves for are always plain `.exe` files on
 * Windows, so appending the extension is the targeted fix, not a
 * workaround that reopens a different hole.
 */
export function resolveExecutablePath(envVarName: string, fallbackCommand: string): string {
  const override = process.env[envVarName]?.trim();
  if (override && override.length > 0) {
    return override;
  }
  return process.platform === 'win32' ? `${fallbackCommand}.exe` : fallbackCommand;
}
