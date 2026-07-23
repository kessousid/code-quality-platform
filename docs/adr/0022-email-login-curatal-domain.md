# ADR-0022: Email-based login for @curatal.com — interim, no password/verification yet

## Status

Accepted — extends ADR-0014 (does not replace it: API tokens remain the
credential for CI/programmatic access per ADR-0016; this adds a second,
human-facing path for the browser).

## Context

ADR-0014 deliberately blocked self-serve signup: "no passwords, no
signup flow, no email verification... an operator bootstrap script"
issues tokens. That was the right call for an unfinished multi-tenant
product with no real identity system. The user now wants a genuine
one-click browser experience — type an email, get in — for a real but
narrow audience: people at `curatal.com`. Explicit instruction: **no
password, no email verification yet** ("we will build the authentication
later") — the ask right now is identity-by-email, not security.

## Decision

**`POST /auth/login`** — a new, `@Public()` endpoint alongside the
existing (unchanged) `POST /auth/session`. Body: `{ email }`. Rejects
any domain other than `curatal.com` with a 401. On a valid domain:

1. Find-or-create a **single shared `Org`** (well-known slug `curatal`)
   — every `@curatal.com` login lands in the same org. This is an
   internal team tool, not a multi-tenant SaaS; one shared workspace
   matches how the rest of this platform already assumes single-org
   usage (ADR-0003).
2. Find-or-create a `User` row for that email (name defaulted from the
   email's local part — there's no profile step yet).
3. **Revoke that user's previous `ApiToken`(s), issue a fresh one, set
   it as the session cookie** — reusing `ApiTokenGuard`/`CurrentOrg`/
   `SESSION_COOKIE_NAME` exactly as built in ADR-0014, unchanged. This
   is the key simplification: rather than building a parallel session
   system, email login is "skip pasting a token — the server mints one
   for you and remembers whose it is." Revoking-then-reissuing (instead
   of trying to reuse an old token) is required because `ApiToken`
   only ever stores a hash (ADR-0014) — the raw value from a previous
   login was never retrievable again anyway.

**What this deliberately does not do**, all per the explicit "no
authentication yet" instruction:

- No password. Typing `keshavkumar@curatal.com` and clicking submit is
  the entire check. Anyone who knows (or guesses) a `curatal.com`
  address can act as that person.
- No email verification. The address is never confirmed as reachable
  or owned by the person typing it.
- No rate limiting on login attempts beyond what already exists
  globally (none yet).

This is a real, intentional gap, not an oversight — it trades security
for the explicitly requested "no click of authentication" experience,
for a narrow, trusted, non-public audience. **Do not deploy this
build reachable from the public internet** (Railway, later) without
first replacing this with real password/verification — that is
explicitly deferred work, not "already handled."

## New domain surface

- `packages/core`: `User`/`UserRepository`, `Org`/`OrgRepository`
  (both new — nothing modeled `Org` as a first-class domain type before
  this; it was Prisma-only, touched directly by the bootstrap script).
  `ApiTokenRepository` gains `revokeAllByName(orgId, name)`.
- `packages/application`: `LoginWithEmailUseCase` — the only place the
  `curatal.com` domain check and the shared-org slug are hardcoded.
- `apps/api`: `AuthController.login`, `LoginRequestDto`.
- `apps/web`: `LoginPage` becomes an email field, not a token-paste
  field. The token-paste path still exists server-side (`/auth/session`)
  for anyone who has a real API token; it's just not what the browser
  UI shows by default anymore.

## Consequences

- **The operator bootstrap script is no longer required for basic
  use.** Anyone with a `curatal.com` email can log in and immediately
  have a working org — closing the last manual, terminal-only step
  standing between "clone the repo" and "click around in the browser."
  `bootstrap-org.js` still exists for anyone who wants a token without
  going through email login (e.g., wiring up CI per ADR-0016).
- Every `curatal.com` login shares one org's data — repos, scans,
  findings are visible to anyone who logs in with any `curatal.com`
  address. Acceptable for a trusted internal team; revisit alongside
  ADR-0003's deferred real multi-tenancy if that stops being true.
- A user's `ApiToken` churns on every login (old one revoked, new one
  issued) — by design, not a bug. `ApiToken.lastUsedAt`/`createdAt`
  history for a given user is therefore mostly a login-frequency log,
  not a request-frequency one.
