# ADR-0001: Orchestrate existing analysis engines instead of building custom parsers

## Status

Accepted

## Context

The brief calls for code quality, security (OWASP/API Top 10), dependency
vulnerability, secret detection, architecture, performance, database, IaC,
test-coverage, documentation, and best-practice analysis across JS, TS, React,
Next.js, Node, Express, MongoDB, HTML/CSS, Docker, YAML, GitHub Actions, and
GitLab CI — with more languages to follow as plugins.

Building correct, low-false-positive AST analysis for each of these
language/framework combinations from scratch is a multi-year effort per
language and duplicates work that mature OSS tools already do well.

## Decision

The platform orchestrates best-of-breed existing engines behind a common
`AnalyzerPlugin` interface, and normalizes every result into one `Finding`
schema before any correlation or AI step runs:

| Concern                                                             | Engine                                       |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Security rules (SAST, cross-language)                               | Semgrep                                      |
| JS/TS style, complexity, some SOLID-adjacent rules                  | ESLint + typescript-eslint + custom rule set |
| Duplicated code                                                     | jscpd                                        |
| Dead code / unused exports                                          | ts-prune, depcheck                           |
| Module/dependency graph                                             | madge, dependency-cruiser                    |
| Secret detection                                                    | gitleaks                                     |
| Dependency vulnerabilities (SCA)                                    | OSV-Scanner, `npm audit`                     |
| Docker / IaC / CI YAML                                              | checkov                                      |
| Structural TS analysis needed for correlation (symbols, call graph) | ts-morph                                     |

Custom code is written only where no adequate OSS tool exists:
cross-file/cross-service correlation, reachability-aware severity adjustment,
business-impact scoring, deduplication, and AI-driven explanation/patch
drafting. This is also where the product's actual value lives — see the
Semgrep-vs-manual-pentest comparison in the parent CuratalIT repo, where the
gap between raw tool output and what a human pentester cared about was almost
entirely about reachability and business logic, not missing parsers.

## Consequences

- Faster time-to-value; correctness of parsing/rule-matching is someone else's
  maintenance burden.
- The platform is dependent on external tool availability, output stability,
  and licensing (see Open Risks in the architecture overview — Semgrep OSS vs
  Pro ruleset needs verification before commercial use).
- Each engine needs a thin adapter that maps its native output to the
  normalized `Finding` schema. Adding a new engine is additive; it does not
  touch the orchestrator or correlation logic.
- Adding a new language/framework in the future means adding new plugin
  adapters (e.g., Semgrep already covers many languages out of the box;
  Python/Java-specific structural analysis would need a new plugin analogous
  to the ts-morph one).
