# ADR-0061: Panel Admin persona dashboard navigation check

## Status

Accepted

## Context

Third of the planned per-persona dashboard checks (docs/adr/0059
Master Recruiter, docs/adr/0060 Scheduling Admin). Panel Admin logs in
through the same `https://portal.curatal.com/auth/curatal-users/login`
form as Scheduling Admin — a different account on the same login page,
not a fourth distinct URL.

Live-verified against production with the real Panel Admin account
before writing any selector: no promo modal (same as Scheduling Admin),
same collapsed icons-only sidebar, same shared expand/duplicate-element
behavior already covered by `expandCollapsedAdminSidebar`/
`isAdminSidebarNavItemVisible` in `portal-navigation.ts` — no further
promotion needed since this is the third persona reusing infrastructure
that was already generalized in docs/adr/0060, not persona-specific
behavior.

## Decision

New files in `packages/qa-automation-tests`:

- `panel-admin-navigation.ts` — `loginToPanelAdminDashboard`, mirroring
  `scheduling-admin-navigation.ts` exactly (same login form, no popup,
  shared sidebar helpers).
- `panel-admin-dashboard-navigation.test-impl.ts` —
  `PanelAdminDashboardNavigationTest`: logs in as Panel Admin, asserts
  "Logged In As Panel Admin" appears in the top bar, and asserts all 7
  expected sidebar items (Dashboard, User Management, Interviewer
  Search, Add Interviewer, Reports, Candidate Interview Management,
  Netting) are visible.

`createPortalAutomationTests` gains a sixth optional credentials
parameter, `panelAdminCredentials`, following the same precedent as
every prior persona-specific parameter.
`apps/qa-automation/src/main.ts` reads two more required env vars,
`PORTAL_QA_PANEL_ADMIN_EMAIL`/`PORTAL_QA_PANEL_ADMIN_PASSWORD`, via
`requireEnv`. Both were set on the `qa-automation` Railway service
before this code was deployed, for the same crash-on-boot reason noted
in docs/adr/0059 and docs/adr/0060.

## Consequences

- Production QA automation now covers 4 personas end-to-end (candidate/
  employer, Master Recruiter, Scheduling Admin, Panel Admin) and 11
  total checks.
- Same accepted tradeoff as every other credential pair in
  `apps/qa-automation/src/main.ts`: a missing Panel Admin env var
  crashes the whole service on boot, not just this one check.
- This persona's nav list (7 items) is distinct from Scheduling Admin's
  (4 items) despite sharing a login form — the two must be kept as
  separate expected-item lists, not merged, since they're genuinely
  different roles with different sidebars.
