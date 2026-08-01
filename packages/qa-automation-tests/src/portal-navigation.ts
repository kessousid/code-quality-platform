import type { Page } from 'playwright';
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

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
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

function formatSelectTimeHeading(date: Date): string {
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const month = MONTH_NAMES[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  return `Select Time (${weekday}, ${month} ${day})`;
}

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

export async function selectCalendarDate(page: Page, date: Date): Promise<void> {
  const cellLabel = formatCalendarCellLabel(date);
  await page.getByLabel(cellLabel, { exact: true }).click();
  await page.waitForTimeout(1500);

  const expectedHeading = formatSelectTimeHeading(date);
  const matched = await page
    .getByText(expectedHeading)
    .isVisible()
    .catch(() => false);
  if (!matched) {
    throw new Error(
      `Clicked the calendar cell for "${cellLabel}" but "${expectedHeading}" never appeared.`,
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
 * Scopes to the panel whose own heading is `sectionHeading` ("Priority
 * Flexible Slots" / "Free Slots") and reads its real slot-time buttons —
 * not the calendar's day cells or unrelated buttons elsewhere on the page.
 */
export async function readSlotTimes(page: Page, sectionHeading: string): Promise<SlotTime[]> {
  const panel = page.locator('div').filter({ hasText: sectionHeading }).last();
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
