# ADR-0059: Per-persona dashboard navigation checks, starting with Master Recruiter

## Status

Accepted

## Context

Production QA automation (docs/adr/0035) has 8 checks today, all against
the candidate/employer side of the portal. The user wants to add checks
that validate a persona actually lands on the right dashboard with the
right navigation after login — starting with the recruiter persona
(login at `https://portal.curatal.com/auth/recruiter/login`, distinct
from the candidate/employer login `portal-navigation.ts`'s
`loginAndExpandSidebar` uses), with more personas planned as follow-ups.

Live-verified against production with the real recruiter account before
writing any selector, per this package's established practice (see
`portal-navigation.ts`'s own doc comments) — two things did not match
what was initially assumed from a screenshot alone:

1. After login, a one-time "Introducing Curatal's AI Assessment" promo
   modal appears (not seen by the existing Platform Admin login flow in
   `candidate-search-navigation.ts`, which shares the exact same login
   form/URL). Its dismiss button reads **"Skip"**, not "Cancel."
2. The sidebar loads collapsed to icons-only, same as the candidate
   portal's own sidebar — needs the same icon-only, no-accessible-name
   expand-arrow coordinate click already documented in
   `portal-navigation.ts`'s `loginAndExpandSidebar`. Every expanded
   sidebar label also renders as **two** same-text elements: the real
   visible item, and a second, zero-width one earlier in the DOM
   (confirmed via `boundingBox()` — width 0). `getByText(...).first()`
   silently resolves to the hidden one and reports "not visible" even
   when the item is plainly on screen; only the _last_ match is real.

## Decision

New files in `packages/qa-automation-tests`:

- `recruiter-navigation.ts` — `loginToRecruiterDashboard` (login, dismiss
  the Skip modal if present, expand the sidebar) and
  `isSidebarNavItemVisible` (checks `.last()`, not `.first()`, per the
  duplicate-element finding above).
- `recruiter-dashboard-navigation.test-impl.ts` —
  `RecruiterDashboardNavigationTest`: logs in as Master Recruiter,
  asserts "Logged In As Master Recruiter" appears in the top bar, and
  asserts all 12 expected sidebar items (Dashboard, Create Job, JD List,
  Candidate Search, Unlocked Candidates, User Management, Vendor
  Management, Reports, Assessments, Events, Billing and Subscription,
  Netting) are visible.

`createPortalAutomationTests` (`packages/qa-automation-tests/src/index.ts`)
gains a fourth optional credentials parameter, `recruiterCredentials`,
following the exact precedent set by `slotCheckCredentials` and
`candidateSearchCredentials` — a dedicated account for this persona,
defaulting to the general `credentials` account when omitted (though in
practice this check needs a real recruiter login to mean anything).

`apps/qa-automation/src/main.ts` reads two new **required** env vars,
`PORTAL_QA_RECRUITER_EMAIL`/`PORTAL_QA_RECRUITER_PASSWORD`, via
`requireEnv` — matching every other persona-specific credential pair in
this file (`PORTAL_QA_SLOT_CHECK_*`, `PORTAL_QA_PLATFORM_ADMIN_*`), all
of which are mandatory rather than optionally-gated. Both were set on
the `qa-automation` Railway service before this code was deployed, to
avoid crash-looping the service on redeploy.

## Consequences

- This is the first of several planned per-persona dashboard checks —
  the pattern (dedicated login helper file + one `*.test-impl.ts` +
  one more `createPortalAutomationTests` parameter) is meant to repeat
  for each new persona, not be special-cased.
- Like every other credential pair in `apps/qa-automation/src/main.ts`,
  a missing `PORTAL_QA_RECRUITER_EMAIL`/`PASSWORD` crashes the entire
  `qa-automation` service on boot, not just this one check — an
  existing, accepted tradeoff in this file, not something new introduced
  here.
- The sidebar item list is exact text, not a pattern — if the recruiter
  portal renames or reorders a nav item, this check will report it
  missing (correct behavior), but if an item is genuinely removed from
  the product, this list needs a matching update or the check will
  permanently fail.
- The two Playwright fragility points already flagged above (the
  coordinate-based sidebar expand click, and the need to always take
  `.last()` for nav item text) are copied conventions from
  `portal-navigation.ts`'s candidate-portal checks — same category of
  risk, not new risk introduced by this feature.
