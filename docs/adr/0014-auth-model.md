# ADR-0014: Auth model — API tokens only, no separate session/password system

## Status

Accepted

## Context

Phase 5's vertical slice shipped with a flagged, known gap: `orgId` came
straight from the request body, with an explicit comment that this was
only acceptable because auth didn't exist yet. Phase 6 has to close that
gap for real. The backlog also asks for "session auth for dashboard,"
which — taken at face value — implies a second, separate credential system
(signup, password hashing, login forms, password reset) alongside API
tokens. Building that full identity system is a large feature in its own
right, not a natural part of "API design," and isn't something to build
silently just because a backlog bullet mentions "session."

## Decision

**One credential type: the API token.** No passwords, no signup flow, no
email verification. `ApiToken` (Phase 6 schema addition) stores only a
hash — the raw token is shown exactly once, at issuance, by an operator
bootstrap script (`apps/api` has no public "create org" or "create token"
endpoint; per ADR-0003, self-serve onboarding is explicitly out of scope
until there's a real second tenant).

**The dashboard reuses the same token**, not a separate session store:
`POST /auth/session` accepts a bearer token in the body, validates it the
same way the API guard does, and — if valid — sets it as an httpOnly,
`SameSite=Strict` cookie. `ApiTokenGuard` reads the token from either the
`Authorization: Bearer` header (API clients) or that cookie (the browser
dashboard), so there is exactly one validation path, not two credential
systems to keep in sync.

Every authenticated request resolves `orgId` from the validated token via
`@CurrentOrg()`, a parameter decorator backed by the guard. **No endpoint
ever reads `orgId` from a request body or query string again** — this is
the concrete fix for the gap Phase 5 flagged, not a future promise.

`/health` and the Swagger `/docs` route are the only endpoints marked
`@Public()` (a reflector-based override), so the guard applies everywhere
else by default rather than requiring each new controller to remember to
opt in.

## Consequences

- No real user identity (name, email, "who on the team did this") exists
  yet — an `ApiToken` is scoped to an org, not a person. `User` (Phase 4's
  schema) exists for future attribution (`triggeredByUserId` on `Scan`) but
  nothing currently populates it from auth. Acceptable for a single-operator
  MVP; revisit alongside ADR-0003's deferred multi-tenancy work once
  per-person attribution actually matters.
- Token revocation is a hard delete of usefulness (`revokedAt` set, checked
  on every request) but there is no token rotation UI/flow yet — rotating a
  token means running the bootstrap script again and updating whatever
  stored the old one.
- If a future phase needs real user login (multiple humans per org, with
  different permissions), that is a new, deliberate ADR — not a retrofit
  onto the token model described here.
