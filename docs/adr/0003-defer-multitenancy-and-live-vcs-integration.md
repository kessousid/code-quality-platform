# ADR-0003: Defer multi-tenancy hardening and live VCS App integration past MVP

## Status

Accepted

## Context

The brief specifies multi-tenant design and GitHub/GitLab/CI-CD integration
as core requirements. Both are real, commercially necessary — but both are
also large surfaces (OAuth app registration and review, webhook
infrastructure, tenant data isolation guarantees, billing) that add
significant time before the core value (scan → correlate → explain → report)
can even be validated once.

## Decision

- **Schema-level multi-tenancy from day one, enforcement later.** Every table
  carries `org_id` from the first migration, and all queries are written
  tenant-scoped. What is deferred is the hardening layer: row-level security,
  tenant-aware auth/session management, per-tenant rate limiting, and billing.
  This makes multi-tenancy additive later rather than a schema rewrite, without
  paying the full isolation-engineering cost before there is a second tenant.
- **VCS integration starts local.** MVP scans a local filesystem path or a
  git clone URL, triggered via CLI or a direct API call with a token. A
  GitHub/GitLab App (OAuth, installation webhooks, PR status checks, CI
  marketplace actions) is a distinct, later phase, undertaken once the
  engine's output is trusted enough to be worth wiring into someone's PR
  gate.
- CI/CD-ready in the near term means: the scan API and SARIF output are
  usable from any pipeline via a simple HTTP call + auth token — not that a
  published GitHub Action / GitLab CI template exists yet.

## Consequences

- First working environment is effectively single-tenant in practice, though
  the data model does not need to change when a second org/tenant is added.
- No commercial pilot with a second paying customer should proceed without
  revisiting this ADR and implementing the deferred isolation/billing work.
- Live PR-check integration (a strong product feature) is explicitly not in
  the initial demo; expectations with any early users should be set
  accordingly.
