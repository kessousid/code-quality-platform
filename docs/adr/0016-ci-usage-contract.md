# ADR-0016: CI/CD usage is the existing REST API with a token — no bespoke webhook receiver yet

## Status

Accepted

## Context

The original brief and ADR-0003 both mention "CI/CD ready." Taken one way,
that means building an inbound webhook receiver (GitHub/GitLab posting
push/PR events to this platform) and a published CI Action/template.
ADR-0003 already deferred exactly that — the OAuth App, installation
webhooks, and PR status checks are explicitly out of scope until the core
scan loop is trusted. Phase 6 has to decide what "CI/CD ready" means in
the meantime, or the backlog bullet ("webhook/callback contract for CI
usage, even without a published Action yet") has nothing concrete to point
at.

## Decision

"CI/CD ready" for now means: **a CI pipeline calls the same REST API a
human or script would**, using an `ApiToken` (ADR-0014) stored as a CI
secret. No separate webhook contract, no CI-specific endpoint. Concretely:

```
POST /scans            { repoId, ref, mode }   -> 201 { id, status: "queued" }
GET  /scans/{id}                                -> 200 { status, ... }   (poll until completed/failed)
GET  /scans/{id}/reports?format=sarif           -> 200 { storageKey, ... } (Phase 9 fills in real content)
```

Documented concretely in `docs/api/ci-usage.md` with a real polling-loop
example, since "just use the REST API" is not self-explanatory without one.

## Consequences

- No GitHub Action / GitLab CI template is published this phase — a team
  wanting this today writes ~10 lines of `curl`/`jq` in their own pipeline
  config, using the ci-usage doc as the reference.
- PR status checks (a green/red check on the PR itself) are not possible
  without the deferred GitHub/GitLab App — a CI job can fail the build
  based on the poll result, but nothing posts back to the PR UI directly.
  This is the same limitation ADR-0003 already accepted, restated here so
  it's visible from the API-design side too.
- If/when the GitHub/GitLab App work happens, it becomes a _client_ of
  these same endpoints (an inbound webhook triggers the same `POST /scans`
  this ADR describes) rather than a parallel API surface — so this
  contract is not throwaway work once that phase starts.
