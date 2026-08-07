import type { Locator, Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';

const PORTAL_URL = 'https://portal.curatal.com/';

/**
 * Live-verified against production while planning docs/adr/0035 — every
 * step here reflects real observed behavior, not a guess. The sidebar's
 * expand arrow has no discoverable accessible name (icon-only, no
 * aria-label found during exploration), so this is a real fragility
 * point: if the site's layout changes, this coordinate click is the
 * first thing to re-verify. Shared by every test — each one navigates
 * to its own screen from here via its own sidebar item.
 */
export async function loginAndExpandSidebar(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(2500);
  await page.getByPlaceholder('example@email.com').fill(credentials.email);
  await page.getByPlaceholder('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForTimeout(4000);

  await page.mouse.click(76, 109); // sidebar expand arrow — see note above
  await page.waitForTimeout(500);
}

export async function loginAndReachBookingScreen(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await loginAndExpandSidebar(page, credentials);

  const myInterviewsVisible = await page
    .getByText('My Interviews', { exact: true })
    .isVisible()
    .catch(() => false);
  if (!myInterviewsVisible) {
    throw new Error(
      'Could not find "My Interviews" in the sidebar after expanding it — the site layout may have changed.',
    );
  }
  await page.getByText('My Interviews', { exact: true }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Book Interview Slot' }).click();

  // A candidate account with an incomplete profile (e.g. the dedicated
  // slot-check account, docs/adr/0037) gets a "Candidate Verification
  // Details" modal here that an already-verified account never sees.
  // Confirmed live: a fixed sleep + one instant isVisible() snapshot is a
  // real race — if the modal renders even slightly slower than the sleep,
  // the check misses it, the Cancel click never happens, and the modal
  // stays open covering the calendar (which can pull every date cell out
  // of the accessibility tree, making isDateBookable wrongly report every
  // single date as "not open" — a real production incident, not a
  // hypothetical one). waitFor actively waits for the modal instead of a
  // single snapshot, so it's found whenever it actually appears.
  //
  // Timeout raised from 8s to 20s and this whole step now logs its real
  // timing (docs/adr/0035's console.error precedent) — a first attempt at
  // 8s was verified working from a local machine, but the SAME code kept
  // failing on every real scheduled run in the Railway container
  // afterward. That gap (works locally, not in the container) is the
  // actual open question, not yet root-caused — this logging is how the
  // next real run actually proves out what's really happening there
  // rather than guessing again.
  const modalWaitStarted = Date.now();
  const verificationModalVisible = await page
    .getByText('Candidate Verification Details')
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const modalWaitMs = Date.now() - modalWaitStarted;
  console.log(
    `[portal-navigation] verification modal ${verificationModalVisible ? 'appeared' : 'did not appear'} after ${modalWaitMs}ms`,
  );
  if (verificationModalVisible) {
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(1000);
  } else {
    await page.waitForTimeout(2000);
  }
}

/**
 * Live-verified for the Development Report download test (docs/adr/0035)
 * — clicking "My Interviews" already lands on the Completed tab by
 * default in production, but the explicit click here doesn't rely on
 * that being true, in case the site's own default tab ever changes.
 */
export async function loginAndReachCompletedInterviewsTab(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await loginAndExpandSidebar(page, credentials);

  const myInterviewsVisible = await page
    .getByText('My Interviews', { exact: true })
    .isVisible()
    .catch(() => false);
  if (!myInterviewsVisible) {
    throw new Error(
      'Could not find "My Interviews" in the sidebar after expanding it — the site layout may have changed.',
    );
  }
  await page.getByText('My Interviews', { exact: true }).click();
  await page.waitForTimeout(3000);

  const completedTabVisible = await page
    .getByText('Completed', { exact: true })
    .isVisible()
    .catch(() => false);
  if (!completedTabVisible) {
    throw new Error(
      'Could not find a "Completed" tab on the My Interviews page — the site layout may have changed.',
    );
  }
  await page.getByText('Completed', { exact: true }).click();
  await page.waitForTimeout(2500);
}

/** Live-verified for the new Premium-upgrade test (docs/adr/0035) — "Jobs" is a sibling sidebar item to "My Interviews". */
export async function loginAndReachJobsPage(
  page: Page,
  credentials: PortalCredentials,
): Promise<void> {
  await loginAndExpandSidebar(page, credentials);

  const jobsVisible = await page
    .getByText('Jobs', { exact: true })
    .isVisible()
    .catch(() => false);
  if (!jobsVisible) {
    throw new Error(
      'Could not find "Jobs" in the sidebar after expanding it — the site layout may have changed.',
    );
  }
  await page.getByText('Jobs', { exact: true }).click();
  await page.waitForTimeout(3000);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The calendar library renders each day cell as `<abbr aria-label="{Day}
 * {Month} {Year}">` (no zero-padding, e.g. "2 September 2026") — confirmed
 * live against production (the format was previously "{Month} {Day},
 * {Year}"; the site changed it — live-reverified after a real production
 * failure showed the old format no longer matching anything). Matching by
 * the visible day-number text alone is ambiguous, since the widget shows
 * a full 6-week grid including grayed-out, disabled overflow days from
 * adjacent months that can share the same day number. The aria-label
 * already disambiguates the exact date uniquely, so this targets it
 * directly instead of guessing among same-numbered cells.
 */
export function formatCalendarCellLabel(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * Whether `date`'s calendar cell is present and enabled. `count()` is
 * checked first — live-verified that `isEnabled()` on a locator matching
 * *zero* elements (e.g. a date outside the currently displayed month)
 * does not resolve immediately as its own name suggests, but instead
 * waits the full default actionability timeout (30s) before throwing —
 * the opposite of the fast, non-throwing check this needs. `count()`
 * itself always resolves immediately with no waiting, so that's checked
 * first and short-circuits to `false` with no 30s cost. Once at least
 * one element genuinely exists, `isEnabled()` on it does behave as
 * expected (immediate, no waiting) — confirmed directly against a real
 * production failure where the exact same date was selectable a few days
 * earlier but not once it became the upcoming Sunday.
 */
export async function isDateBookable(page: Page, date: Date): Promise<boolean> {
  const cellLabel = formatCalendarCellLabel(date);
  const cell = page.getByLabel(cellLabel, { exact: true });
  const count = await cell.count();
  if (count === 0) {
    // Diagnostic only (see the modal-wait logging above this same file) —
    // dumps every aria-label actually present so a real run's logs show
    // whether the calendar just isn't there at all (a modal still
    // covering it, a different page entirely) versus this exact label
    // genuinely not existing among a normal-looking set of date cells.
    const allLabels = await page
      .locator('[aria-label]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')).filter(Boolean))
      .catch(() => ['<failed to read aria-labels>']);
    console.log(
      `[portal-navigation] isDateBookable("${cellLabel}"): 0 matching elements. All aria-labels on page: ${JSON.stringify(allLabels)}`,
    );
    return false;
  }
  return cell.isEnabled();
}

/**
 * Verifies the click actually landed by checking for one of the two slot
 * panels — not the "Select Time (Weekday, Month DD)" heading a prior
 * version of this function checked for, which turned out not to match
 * the real live text (confirmed by two separate real production
 * failures where the click itself succeeded but that heading check
 * failed). The panel headings are already load-bearing for
 * `readSlotTimes` downstream, so this is a signal the rest of the flow
 * depends on anyway, not a new assumption.
 */
export async function selectCalendarDate(page: Page, date: Date): Promise<void> {
  const cellLabel = formatCalendarCellLabel(date);

  // A real production run hit a disabled cell (confirmed by the exact
  // "element is not enabled" retry log) and burned the full 30s default
  // click timeout retrying it pointlessly — checking first fails in
  // milliseconds with a clear reason instead.
  if (!(await isDateBookable(page, date))) {
    throw new Error(
      `Calendar cell for "${cellLabel}" is disabled — the site hasn't made this date bookable yet.`,
    );
  }

  const cell = page.getByLabel(cellLabel, { exact: true });
  await cell.click();
  await page.waitForTimeout(2000);

  const priorityVisible = await page
    .getByText('Priority Flexible Slots')
    .isVisible()
    .catch(() => false);
  const freeVisible = await page
    .getByText('Free Slots')
    .isVisible()
    .catch(() => false);
  if (!priorityVisible && !freeVisible) {
    throw new Error(
      `Clicked the calendar cell for "${cellLabel}" but no slot panel appeared afterward.`,
    );
  }
}

export interface SlotTime {
  label: string;
  minutesSinceMidnight: number;
}

/** Parses "09:00 AM" / "07:00 PM" into minutes-since-midnight for the ≤9:00/≥19:00 comparisons. */
export function parseSlotTime(label: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!match) {
    throw new Error(`Not a recognized slot time: "${label}"`);
  }
  const [, hourStr, minuteStr, meridiem] = match;
  let hour = Number(hourStr) % 12;
  if (meridiem!.toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(minuteStr);
}

export const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

/**
 * Locates the panel whose own heading is `sectionHeading` ("Priority
 * Flexible Slots" / "Free Slots") — the single source of truth for this
 * scoping, used by both `readSlotTimes` below and `SlotBookingFlowTest`
 * (a second, independent copy of this same scoping logic in that file
 * previously went unfixed alongside this one, causing a real production
 * failure even after this function itself was fixed).
 *
 * The heading itself is a bare `<p>`, not a `div` — `div.filter({hasText})`
 * matches 18 divs on this page, and `.last()` (confirmed against a real
 * production failure) resolves to the *header row* div wrapping only the
 * `<p>`, with zero buttons, not the panel that actually holds the time
 * buttons. Climbing ancestor `<div>`s from the heading until the first
 * one that actually contains a button reliably lands on the real panel —
 * verified directly against the live DOM for both a slot-filled panel and
 * the empty "Free Slots on Sunday" case (there it lands one level higher,
 * on a div containing only the "Schedule Interview" button).
 */
export async function findSlotPanel(page: Page, sectionHeading: string): Promise<Locator> {
  const heading = page.getByText(sectionHeading, { exact: true }).first();
  for (let level = 1; level <= 8; level += 1) {
    const ancestor = heading.locator(`xpath=ancestor::div[${level}]`);
    if ((await ancestor.count()) === 0) break;
    if ((await ancestor.getByRole('button').count()) > 0) {
      return ancestor;
    }
  }
  return heading;
}

/**
 * Reads the panel's real slot-time buttons — not the calendar's day cells
 * or unrelated buttons elsewhere on the page. The time-pattern filter
 * below excludes the odd non-time button (e.g. "Schedule Interview")
 * `findSlotPanel` can pick up when a panel is genuinely empty.
 */
export async function readSlotTimes(page: Page, sectionHeading: string): Promise<SlotTime[]> {
  const panel = await findSlotPanel(page, sectionHeading);
  const buttonTexts = await panel.getByRole('button').allInnerTexts();
  return buttonTexts
    .map((t) => t.trim())
    .filter((t) => TIME_PATTERN.test(t))
    .map((label) => ({ label, minutesSinceMidnight: parseSlotTime(label) }));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export interface RetryOutcome {
  succeeded: boolean;
  auditTrail: string[];
}

/**
 * Retries `check` a few times with a delay, re-selecting the calendar
 * date before each retry to force a fresh read (the slot panels don't
 * appear to auto-refresh on their own) — per the user: a slot that
 * looks momentarily missing should be retried, and every attempt
 * recorded in the returned audit trail rather than the first read
 * being taken at face value. Confirmed directly against production
 * that a real Priority slot can be present one moment and briefly gone
 * the next, so a single read isn't reliable evidence either way.
 */
export async function retryOnMissingSlot(
  page: Page,
  date: Date,
  label: string,
  check: () => Promise<boolean>,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<RetryOutcome> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 5000;
  const auditTrail: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await check()) {
      auditTrail.push(
        attempt === 1
          ? `${label}: found on first check.`
          : `${label}: found on retry attempt ${attempt}/${attempts} (missing on attempt(s) 1-${attempt - 1}).`,
      );
      return { succeeded: true, auditTrail };
    }
    auditTrail.push(`${label}: not found on attempt ${attempt}/${attempts}.`);
    if (attempt < attempts) {
      await page.waitForTimeout(delayMs);
      await selectCalendarDate(page, date);
    }
  }
  return { succeeded: false, auditTrail };
}

/**
 * Per the user: after 3 PM IST, the site stops making *today* bookable
 * at all — same-day scheduling closes for the day, and the bookable
 * window shifts forward to the next 2 available days instead. Checked
 * in IST specifically (not the server's own local time), since that's
 * the site's own operating timezone regardless of where this runs.
 */
const SAME_DAY_CUTOFF_HOUR_IST = 15;

function isPastSameDayCutoffIST(from: Date): boolean {
  const istHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(from),
  );
  return istHour >= SAME_DAY_CUTOFF_HOUR_IST;
}

/**
 * The real IST calendar day for `from` — a confirmed real production bug
 * (not just a theoretical one) made this necessary: this whole module
 * otherwise reads/writes dates via the *container's own local timezone*
 * (plain `getDate()`/`setDate()`), not IST. Railway's container runs in
 * UTC. Between midnight and 5:30 AM IST, IST has already rolled to a new
 * calendar day while UTC hasn't yet — so `new Date()`'s own local
 * (UTC) day was still "yesterday" by IST's clock, and every date this
 * module computed from it landed one full day early. Anchoring here to
 * the real IST year/month/day (via `Intl`, independent of the
 * container's own timezone) and only ever doing local-Date arithmetic
 * from *that* point on keeps every downstream `getDate()`/`setDate()`
 * call self-consistent regardless of what timezone the process itself
 * runs in.
 */
function istDateOnly(from: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(from);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}

/**
 * The next `count` real calendar days, starting TODAY (in IST) — per the
 * user, production only ever makes today and tomorrow bookable at all,
 * so a window that started at tomorrow (skipping today entirely) missed
 * a real bookable day, and a window reaching further than tomorrow hit
 * calendar cells the site hadn't made bookable yet (`nextSunday()` could
 * previously land up to 6 days out looking for a specific weekday). Tests
 * iterate this instead of searching arbitrarily far forward. Once it's
 * past 3 PM IST, "today" drops out of the window entirely (see
 * `isPastSameDayCutoffIST`) — the window starts tomorrow instead, still
 * covering the next `count` real bookable days from there.
 */
export function upcomingDates(count: number, from: Date = new Date()): Date[] {
  const istToday = istDateOnly(from);
  const startOffset = isPastSameDayCutoffIST(from) ? 1 : 0;
  const dates: Date[] = [];
  for (let i = 0; i < count; i += 1) dates.push(addDays(istToday, startOffset + i));
  return dates;
}

/**
 * The first non-Sunday day among the real bookable window (today and
 * tomorrow) — at most one of any 2 consecutive days is a Sunday, so this
 * always finds one, and may return today itself if today isn't Sunday.
 */
export function nextNonSunday(from: Date = new Date()): Date {
  const candidate = upcomingDates(2, from).find((d) => d.getDay() !== 0);
  if (!candidate) {
    throw new Error(
      'No non-Sunday day found within the bookable window — this should never happen.',
    );
  }
  return candidate;
}
