import type { Locator, Page } from 'playwright';
import type { PortalCredentials } from './portal-automation-test.js';

const PORTAL_URL = 'https://portal.curatal.com/';

/**
 * Live-verified against production while planning docs/adr/0035 — every
 * step here reflects real observed behavior, not a guess. The sidebar's
 * expand arrow has no discoverable accessible name (icon-only, no
 * aria-label found during exploration), so this is a real fragility
 * point: if the site's layout changes, this coordinate click is the
 * first thing to re-verify.
 */
export async function loginAndReachBookingScreen(
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
  await page.waitForTimeout(3000);

  const verificationModalVisible = await page
    .getByText('Candidate Verification Details')
    .isVisible()
    .catch(() => false);
  if (verificationModalVisible) {
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(1000);
  }
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
 * The calendar library renders each day cell as `<abbr aria-label="{Month}
 * {Day}, {Year}">` (no zero-padding, e.g. "September 2, 2026") — confirmed
 * from a real production failure: matching by the visible day-number text
 * alone (the original approach here) is ambiguous, since the widget shows
 * a full 6-week grid including grayed-out, disabled overflow days from
 * adjacent months that can share the same day number (e.g. clicking "2"
 * hit the September 2 overflow cell instead of August 2, and Playwright
 * spent the full 30s retrying a click on a cell that's disabled by
 * design). The aria-label already disambiguates the exact date uniquely,
 * so this targets it directly instead of guessing among same-numbered
 * cells.
 */
export function formatCalendarCellLabel(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  return `${month} ${date.getDate()}, ${date.getFullYear()}`;
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
  const cell = page.getByLabel(cellLabel, { exact: true });

  // A real production run hit a disabled cell (confirmed by the exact
  // "element is not enabled" retry log) and burned the full 30s default
  // click timeout retrying it pointlessly — checking first fails in
  // milliseconds with a clear reason instead. A disabled cell here means
  // the site itself hasn't made this date bookable yet, not a selector bug.
  if (!(await cell.isEnabled())) {
    throw new Error(
      `Calendar cell for "${cellLabel}" is disabled — the site hasn't made this date bookable yet.`,
    );
  }

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

const TIME_PATTERN = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

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

/** The next real Sunday, starting the search from tomorrow (never "today", so a test never depends on how much of today has already elapsed). */
export function nextSunday(from: Date = new Date()): Date {
  let candidate = addDays(from, 1);
  while (candidate.getDay() !== 0) candidate = addDays(candidate, 1);
  return candidate;
}

/** The next real non-Sunday day, starting the search from tomorrow. */
export function nextNonSunday(from: Date = new Date()): Date {
  let candidate = addDays(from, 1);
  while (candidate.getDay() === 0) candidate = addDays(candidate, 1);
  return candidate;
}
