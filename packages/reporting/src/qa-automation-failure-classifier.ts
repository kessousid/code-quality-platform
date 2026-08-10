/**
 * Groups a failed QaAutomationTestResult's raw pytest/Playwright traceback
 * text into a small set of actionable categories. Confirmed valuable
 * live: a real 152-failure staging run compressed cleanly into ~6 real
 * root causes once grouped this way, instead of reading 152 individual
 * tracebacks one at a time to spot the pattern.
 */
export function classifyFailureReason(details: string): string {
  const errorLines = details
    .split('\n')
    .filter((line) => /^E\s/.test(line))
    .join('\n');

  if (/RuntimeError: Missing credentials for/i.test(details)) {
    return 'Missing credentials (env var mismatch)';
  }
  if (/RuntimeError: Login did not reach|Failed to find email input/i.test(details)) {
    return 'Login flow did not complete';
  }
  if (/Logout did not result in unauthenticated state/i.test(details)) {
    return 'Logout did not complete';
  }
  if (/NameError: name '\w+' is not defined/i.test(details)) {
    return 'Test code bug: missing import';
  }
  if (/AttributeError: '\w+' object has no attribute/i.test(details)) {
    return 'Test code bug: undefined method/attribute';
  }
  if (/KeyError/i.test(errorLines)) {
    return 'KeyError (missing dict key)';
  }
  if (/strict mode violation/i.test(details)) {
    return 'Playwright strict-mode violation (locator matched multiple elements)';
  }
  if (
    /TimeoutError/i.test(errorLines) ||
    /waiting for /i.test(details) ||
    /-\s*waiting \d+ms/i.test(details)
  ) {
    return 'Playwright timeout waiting for an element/condition';
  }
  if (/AssertionError/i.test(errorLines) || /^E\s+assert /im.test(details)) {
    return 'Assertion failure (content/state mismatch)';
  }
  return 'Other / unclassified';
}

/** Stamped by StagingTestRunner's JUnit parser for a real pytest skip — a passed=true row that isn't a genuine pass. */
const SKIPPED_PREFIX = 'SKIPPED: ';

export function isSkipped(details: string): boolean {
  return details.startsWith(SKIPPED_PREFIX);
}

export function skipReason(details: string): string {
  return details.slice(SKIPPED_PREFIX.length);
}

/** A skip reason mentioning a hang is worth flagging back to whoever maintains the external suite (docs/adr/0045). */
export function isPossibleHang(details: string): boolean {
  return /hang/i.test(details);
}
