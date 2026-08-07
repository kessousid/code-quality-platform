# ADR-0041: Real signup, password, and email verification/reset

## Status

Accepted

## Context

ADR-0022 shipped a deliberately interim login: type any `@curatal.com`
email, no password, no verification, and you're in. That ADR explicitly
flagged real password/verification as necessary future work before the
platform is production-hardened. The user asked to build that now:
signup based on email+password, `@curatal.com`-only, a verification
email sent to the signup address, and a "Forgot Password?" flow that
emails a reset link.

Two decisions were confirmed with the user before building:

- **Replace the old email-only login entirely**, not run it alongside
  the new flow — the old path is gone; a real password is genuinely
  required to sign in from here on.
- **Email verification blocks login.** A signed-up account is created
  `pending_verification` and cannot log in until the emailed link is
  clicked.

## Decision

**`User` gains `passwordHash` (nullable) and `status`
(`pending_verification` | `active`, default `ACTIVE`).** The nullable
`passwordHash` and the `ACTIVE` default are the whole migration story:
every row that predates this ADR (created by ADR-0022's old flow) is
grandfathered in as `active` — they already had access under the old
rules — but has no password until they use "Forgot Password" once. That
flow doesn't just reset a password; it's how a legacy account gets its
_first_ one. No separate migration script, no forced logout, no
one-time bulk password-set — the reset flow already does exactly what's
needed the first time any legacy user goes through it.

**A new `AuthToken` entity covers both email verification and password
reset with one shape** — `purpose: 'email_verification' | 'password_reset'`,
a hashed opaque random secret (mirroring `ApiToken`'s "only the hash is
ever stored" discipline from ADR-0014), an expiry (24h for verification,
1h for reset), and a `usedAt` marking it single-use. `hashApiToken`
(the existing sha256 helper) is reused for these too — same "opaque
random bearer secret" shape, just a different purpose than API tokens.
A human-chosen password needs a genuinely different kind of hash
(salted, adaptive), which is what `password-hash.ts`'s `bcryptjs`-based
`hashPassword`/`verifyPassword` are for — `bcryptjs` specifically
because it's pure JS with no native build step, which matters for this
repo's multi-stage Docker images.

**Five use cases, mirroring `LoginWithEmailUseCase`'s existing
find-or-create-shared-org shape where relevant:**

- `SignupUseCase` — domain check, rejects an already-registered email,
  hashes the password, creates the user `pending_verification`, emails
  a verification link.
- `VerifyEmailUseCase` — validates the token, activates the user, and
  auto-logs them in (issues a session token) — clicking the link is
  itself sufficient proof of identity; there's no reason to also make
  them re-enter the password they just chose.
- `LoginUseCase` (replaces `LoginWithEmailUseCase`) — checks
  `passwordHash` presence first (the legacy-account case, pointing to
  Forgot Password), then `status` (the never-verified case), then the
  actual password. A wrong password and an unknown email produce the
  exact same generic message — never revealing which one was wrong.
- `RequestPasswordResetUseCase` — deliberately anti-enumeration: an
  unknown email still returns success with no error and no email sent;
  only the caller who already knows the account is real could tell the
  two cases apart, and only by knowing whether their own inbox got
  something.
- `ResetPasswordUseCase` — validates the token, sets the new password,
  and activates the account as a side effect (a real reset link only
  ever reaches a real inbox, so successfully using one proves ownership
  just as much as clicking a verification link would) — this is what
  makes it double as the legacy-account migration path, not a special
  case bolted on separately. Also auto-logs in, same reasoning as
  `VerifyEmailUseCase`.

**`apps/api` gets its first `EmailSender` wiring** (previously only
`apps/qa-automation` had one) — a new `EMAIL_SENDER` DI token providing
`NodemailerEmailSender`, reusing the same `ALERT_EMAIL_FROM`/
`ALERT_EMAIL_APP_PASSWORD` Gmail identity already used platform-wide,
not a separate email account per feature. A new `WEB_BASE_URL` env var
(read directly by `AuthController`'s constructor, not a DI token, since
it's a plain string, not a port) is what turns a raw token into the
actual clickable link a user receives — `${WEB_BASE_URL}/verify-email?token=...`,
`${WEB_BASE_URL}/reset-password?token=...`.

**New routes**: `POST /auth/signup`, `POST /auth/verify-email`,
`POST /auth/forgot-password`, `POST /auth/reset-password`, and
`POST /auth/login`'s body changes from `{ email }` to
`{ email, password }`. `POST /auth/session` (real API tokens,
ADR-0014/0016, CI/programmatic clients) is unchanged.

**New web pages**: `/signup`, `/verify-email`, `/forgot-password`,
`/reset-password`, plus a password field added to the existing
`/login`. `VerifyEmailPage` and `ResetPasswordPage` both read `?token=`
from the URL and auto-submit — clicking the emailed link is the entire
interaction on the user's side; landing on either page is a redirect to
`/` on success since both auto-login.

## Consequences

- A verification/reset link is sent as a `POST` from the frontend, not a
  bare `GET` the email client could pre-fetch or a proxy could log —
  the frontend page reads the token from its own URL and POSTs it,
  rather than the link itself being an API endpoint.
- No rate limiting on any of these endpoints — the same gap ADR-0022
  already flagged, still unaddressed. A real production deployment of
  this feature should add it before this is reachable from the open
  internet; out of scope for this change specifically.
- `bcryptjs` is the first password-hashing dependency this repo has
  ever needed — chosen deliberately over `bcrypt`/`argon2` to avoid a
  native build step in the Docker images.
- The anti-enumeration choice on `RequestPasswordResetUseCase` is a real
  trade-off against `SignupUseCase`, which _does_ reveal whether an
  email is already registered (409 Conflict) — accepted as a reasonable
  asymmetry: telling someone "you already have an account, try signing
  in" during signup is normal UX; telling a stranger "this specific
  person has an account" via password reset is a more targeted leak.
