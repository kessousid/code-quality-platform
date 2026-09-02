# ADR-0060: Scheduling Admin persona dashboard navigation check

## Status

Accepted

## Context

Second of the planned per-persona dashboard checks (docs/adr/0059,
Master Recruiter was the first). Scheduling Admin logs in through a
third, distinct login form/URL —
`https://portal.curatal.com/auth/curatal-users/login` — separate from
both the candidate/employer portal login and the
recruiter/`auth/recruiter/login` form.

Live-verified against production with the real Scheduling Admin account
before writing any selector: unlike the recruiter flow, no promo modal
appears after login here, so there's nothing to dismiss. The sidebar
still loads collapsed to icons-only (same icon-only, no-accessible-name
expand control, same coordinates) and expanded labels still render as
the same real-visible-item-plus-hidden-zero-width-duplicate pair
documented in docs/adr/0059 — both confirmed live for this persona too,
not assumed to carry over from the recruiter flow.

Since this is now the second persona sharing that same sidebar
expand/visibility behavior, `expandCollapsedAdminSidebar` and
`isAdminSidebarNavItemVisible` (previously private to
`recruiter-navigation.ts` as `loginAndExpandSidebar`-adjacent helpers)
were promoted into the shared `portal-navigation.ts`, so a third persona
doesn't have to duplicate them again.

## Decision

New files in `packages/qa-automation-tests`:

- `scheduling-admin-navigation.ts` — `loginToSchedulingAdminDashboard`
  (login, no popup to dismiss, expand the sidebar via the shared helper).
- `scheduling-admin-dashboard-navigation.test-impl.ts` —
  `SchedulingAdminDashboardNavigationTest`: logs in as Scheduling Admin,
  asserts "Logged In As Scheduling Admin" appears in the top bar, and
  asserts all 4 expected sidebar items (Dashboard, User Management,
  Candidate Interview Management, Netting) are visible.

`createPortalAutomationTests` gains a fifth optional credentials
parameter, `schedulingAdminCredentials`, following the same precedent as
every prior persona-specific parameter.
`apps/qa-automation/src/main.ts` reads two more required env vars,
`PORTAL_QA_SCHEDULING_ADMIN_EMAIL`/`PORTAL_QA_SCHEDULING_ADMIN_PASSWORD`,
via `requireEnv`. Both were set on the `qa-automation` Railway service
before this code was deployed, for the same crash-on-boot reason noted
in docs/adr/0059.

## Consequences

- Production QA automation now covers 3 personas end-to-end (candidate/
  employer, Master Recruiter, Scheduling Admin) and 10 total checks.
- Same accepted tradeoff as every other credential pair in
  `apps/qa-automation/src/main.ts`: a missing Scheduling Admin env var
  crashes the whole service on boot, not just this one check.
- `expandCollapsedAdminSidebar`/`isAdminSidebarNavItemVisible` are now
  shared infrastructure for this recruiter/admin app shell — a change to
  either affects both the recruiter and scheduling admin checks
  together, which is the intended shared-fate behavior since they share
  the exact same underlying UI shell.
