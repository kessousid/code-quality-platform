# ADR-0070: Port Prod_Automation's persona navigation smoke flows into the production suite

## Status

Accepted

## Context

A separate Python/pytest suite, `Saraswati0284/Prod_Automation`, covers
production (`portal.curatal.com`) with 16 tests:

- 7 login tests, one per persona (candidate, interviewer, master
  recruiter, recruiter, scheduling admin, panel admin, platform admin);
- 7 "smoke flows", one per persona: log in, assert every sidebar tab is
  visible, then click each tab and assert the URL it lands on;
- `test_candidate_signup`, which creates a real candidate account;
- `tests/test_setup.py`, which only opens google.com.

The user wants these added to the existing 11-check production suite
(docs/adr/0035). Three of those 11 (Master Recruiter, Scheduling Admin,
Panel Admin; docs/adr/0059-0061) already assert sidebar _visibility_ for
their persona, but none click through to check where each item goes.

## Decision

**Port to TypeScript into `packages/qa-automation-tests`, not run the
Python repo.** Chosen by the user over cloning and shelling out to pytest
(the staging model, docs/adr/0036). The production suite has no Python
runtime or subprocess runner, and Prod_Automation's 60s sleep between
tests would add about 15 minutes per run.

**Smoke flows only, merged with the existing checks:**

- The 3 existing persona checks keep their ids (run history stays
  continuous) and gain a click-through step checking each item's URL.
- 4 new checks: `candidate-dashboard-navigation`,
  `interviewer-dashboard-navigation`,
  `standard-recruiter-dashboard-navigation` and
  `platform-admin-dashboard-navigation` (12 top-level groups, 35
  destinations including submenus).
- The standalone login tests are dropped: each smoke flow already logs in
  first and fails there with its own message.
- `test_candidate_signup` is excluded (user decision). It writes an
  unrecoverable account to production on every run, and its email counter
  lives in a committed file, so fresh clones would reuse the same email.
- `test_setup.py` is not a production check.

The suite goes from 11 to 15 checks.

**Shared helper `sidebar-click-through.ts`** (`clickThroughSidebar`).
It runs every target and collects failures rather than stopping at the
first one, so one broken page doesn't hide the rest. **Each target starts
from a fresh load of the persona's dashboard**, then is reached by
clicking through the real sidebar. The first version chained clicks from
page to page, and live runs showed state carrying over and breaking
later steps:

- After an in-app route change from the admin shell into a
  recruiter-shell page (Platform Admin > Candidates > Unlocked
  Candidates, `/app/recruiter/unlock-candidate`), the sidebar toggle
  stopped expanding the sidebar. Every click on it navigated to
  `/app/admin/dashboard` instead (a navigation trace showed about 90 of
  these), and every later item failed. After a full load of that same
  page, the same toggle works normally.
- Submenu groups stay open across navigations, and this sidebar doesn't
  scroll. With several groups open, lower items sat below the viewport.
- Create Job's "Which Hiring Service would you like to use?" modal
  (Master Recruiter and Platform Admin) covered the sidebar for the next
  click.

A fresh load per target costs one extra page load each (about 35 for
Platform Admin) and removes all of the above.

Other behaviour confirmed live:

- Sidebar items are matched as leaf `div`s scoped to `#sidebarMain`
  (Prod_Automation's `sidebar_locator`), so a page heading such as
  "Dashboard" never matches.
- The sidebar animates as it collapses, so open/closed is decided from
  two matching width readings, not one.
- Expanding clicks the real toggle, `#sidebarMain > div.absolute` (the
  round arrow on the sidebar's right edge), with a `force` retry. It
  does not use the fixed-coordinate click from
  `expandCollapsedAdminSidebar`: (76, 109) is the arrow only while the
  sidebar is collapsed, and on an expanded sidebar it's the "Dashboard"
  row. The login helpers keep the coordinate click, because the sidebar
  is known to start collapsed there.
- Dialogs are dismissed through their first _visible_ close control
  (Create Job's modal has a hidden duplicate close button ahead of the
  real one and ignores Escape). The dialog's own action buttons are
  never clicked; Create Job's "Continue" would start real job creation.
- Failure details include the locator Playwright was waiting on.
- Each check re-confirms the sidebar is open before its visibility pass.
  The login helpers' one-shot expand click can land before the page is
  ready, which was seen live for Interviewer: its sidebar stayed
  icons-only and every tab read as missing.

**Login fix (`submitLoginUntilAppLoads`).** Confirmed live from network
traffic: on `auth/recruiter/login`, the first Sign In click sometimes
sends no login request at all, and only the second POSTs
`/api/v1/recruiter/login`. The same thing happened intermittently on
`auth/curatal-users/login` (about 1 run in 4 for Scheduling and Panel
Admin). Prod_Automation clicks twice on both forms for this reason. Every
recruiter-form and curatal-users-form login helper (Master Recruiter,
Interviewer, Recruiter, Scheduling Admin, Panel Admin, Platform Admin)
now retries the submit up to 3 times until the app shell loads. This
also fixes the existing Master Recruiter, Scheduling Admin and Panel
Admin checks: without it, Master Recruiter failed reproducibly at login
and the other two failed intermittently.

**URLs Prod_Automation left unconfirmed** (Platform Admin > Customer >
Vendor Management, Role Management) were observed live and pinned:
`/app/admin/vendor-management` and `/app/rolemanagement`.

**Credentials.** Candidate reuses `PORTAL_QA_EMAIL`/`PASSWORD` and
Platform Admin reuses `PORTAL_QA_PLATFORM_ADMIN_*`. Two new required env
vars pairs, `PORTAL_QA_INTERVIEWER_EMAIL`/`PASSWORD` and
`PORTAL_QA_STANDARD_RECRUITER_EMAIL`/`PASSWORD`, are read via
`requireEnv`. Like docs/adr/0059-0061, they must be set on the
`qa-automation` Railway service before this deploys, or the service
crashes on boot. Prod_Automation hardcodes the recruiter passwords in
committed test files; those were not copied here.

## Consequences

- Production QA now covers 7 personas' navigation end to end.
- Platform Admin is by far the longest check (35 page loads). The suite
  has no per-test timeout, so it only lengthens the run.
- Sidebar URLs are now asserted exactly. A deliberate route rename on
  production will fail these checks until the URL list is updated. That
  is the point of the check, but also a new maintenance cost.
- Prod_Automation remains a separate repo. Changes there are not picked
  up automatically; they need another port.
