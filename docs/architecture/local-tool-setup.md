# Local setup for Phase 7's real-tool tests

Phase 7's plugin tests shell out to real tools rather than mocking them
(see docs/adr/0017-external-tool-resolution.md). Two of the three
subprocess-based tools aren't npm packages, so they need a one-time local
setup to run these tests yourself.

## What's needed

| Tool                 | How this sandbox got it                                                    | Needed env var           |
| -------------------- | -------------------------------------------------------------------------- | ------------------------ |
| Semgrep              | `pip install semgrep` (already present in this sandbox)                    | none — resolved via PATH |
| gitleaks             | Downloaded a Windows release binary from GitHub into `.tools/gitleaks/`    | `CQP_GITLEAKS_PATH`      |
| OSV-Scanner          | Downloaded a Windows release binary from GitHub into `.tools/osv-scanner/` | `CQP_OSV_SCANNER_PATH`   |
| ESLint, jscpd, madge | Plain npm dependencies of their respective plugin packages                 | none                     |

`.tools/` is gitignored — it's a sandbox convenience for this environment,
not a deployment mechanism. A real Docker image (Phase 10) installs these
properly (`pip install semgrep`, a `curl` + binary step for the other two)
and they end up on `PATH`, at which point the env var overrides aren't
needed at all.

## Running the real-tool tests yourself

```bash
export CQP_GITLEAKS_PATH="/path/to/gitleaks.exe"       # or gitleaks, if on PATH
export CQP_OSV_SCANNER_PATH="/path/to/osv-scanner.exe" # or osv-scanner, if on PATH
pnpm --filter @cqp/plugin-gitleaks run test
pnpm --filter @cqp/plugin-osv-scanner run test
pnpm --filter @cqp/scan-engine run test   # the full 6-plugin integration test
```

Without these two env vars set (and no `gitleaks`/`osv-scanner` on PATH),
those specific tests fail with a clear `ToolNotFoundError` — not a silent
skip — per ADR-0017.

## Downloading the binaries (Windows, what this sandbox did)

```bash
# gitleaks
curl -sL -o gitleaks.zip https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_<version>_windows_x64.zip
unzip gitleaks.zip gitleaks.exe -d .tools/gitleaks/

# OSV-Scanner
curl -sL -o .tools/osv-scanner/osv-scanner.exe https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_windows_amd64.exe
```

Linux/macOS: use the corresponding release asset for your platform from
the same GitHub releases pages.
