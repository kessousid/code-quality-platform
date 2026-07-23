# ADR-0017: External tool resolution — env var override, then PATH, then a real error

## Status

Accepted

## Context

Three plugins (Semgrep, gitleaks, OSV-Scanner) shell out to standalone
binaries, not npm packages (per ADR-0001). In this sandbox, Semgrep was
already installed (`pip`), and gitleaks/OSV-Scanner were fetched as
Windows binaries into a local `.tools/` directory for genuine testing —
but a production Docker image or a contributor's machine will have these
on `PATH` instead, at whatever location their package manager chose. The
adapters can't hardcode a path that only works in this one sandbox.

## Decision

Each shell-out plugin resolves its binary the same way, in this order:

1. An explicit env var override (`CQP_SEMGREP_PATH`, `CQP_GITLEAKS_PATH`,
   `CQP_OSV_SCANNER_PATH`) — what `.tools/` uses locally in this sandbox,
   and what a Docker image could use to point at a specific install.
2. The bare command name resolved via `PATH` (`semgrep`, `gitleaks`,
   `osv-scanner`) — what a real Docker image or a contributor with these
   tools properly installed gets for free.
3. If neither resolves to an executable, the plugin fails with a specific,
   actionable error (`"semgrep not found — set CQP_SEMGREP_PATH or install
it on PATH"`) — not a generic ENOENT from a failed `spawn()`, and not a
   silent empty-findings result that looks like "this repo has no issues."

## Consequences

- `.tools/` is gitignored and is a sandbox convenience only, not a
  deployment mechanism. Phase 10's Docker work is responsible for actually
  installing these tools into the worker image (`pip install semgrep`, a
  `curl`+binary step for gitleaks/OSV-Scanner) — this ADR only makes the
  adapters portable to wherever that ends up putting them.
- Every adapter's "tool not found" failure is a normal
  `PluginRunResult` error (ADR-0011's contract), not a crash — a
  misconfigured environment loses that one plugin's findings for the scan,
  not the whole scan.
