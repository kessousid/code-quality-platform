import { describe, expect, it } from 'vitest';
import { parseJunitXml } from './junit-xml-parser.js';

const XUNIT2_STYLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" errors="1" failures="1" skipped="1" tests="4" time="12.3">
    <testcase classname="tests.test_candidate.TestCandidateLogin" name="test_TC_CAND_001_login_page_elements" time="1.2"/>
    <testcase classname="tests.test_candidate.TestCandidateLogin" name="test_TC_CAND_002_bad_password" time="0.9">
      <failure message="AssertionError: expected error banner">Traceback (most recent call last):
    assert False
AssertionError: expected error banner</failure>
    </testcase>
    <testcase classname="tests.test_admin" name="test_admin_dashboard_loads" time="0.4">
      <error message="TimeoutError: locator not found">playwright._impl._errors.TimeoutError: locator not found</error>
    </testcase>
    <testcase classname="tests.test_mentor" name="test_mentor_calendar_sync" time="0.1">
      <skipped message="requires calendar integration credentials"/>
    </testcase>
  </testsuite>
</testsuites>`;

const LEGACY_BARE_TESTSUITE_XML = `<?xml version="1.0" encoding="utf-8"?>
<testsuite name="pytest" errors="0" failures="0" skipped="0" tests="1" time="0.5">
  <testcase classname="tests.test_employer" name="test_employer_login" time="0.5"/>
</testsuite>`;

describe('parseJunitXml', () => {
  it('parses a mix of passed, failed, errored, and skipped testcases from an xunit2-style <testsuites> report', () => {
    const results = parseJunitXml(XUNIT2_STYLE_XML);

    expect(results).toHaveLength(4);

    const passed = results.find((r) => r.testId.endsWith('test_TC_CAND_001_login_page_elements'));
    expect(passed).toEqual({
      testId: 'tests.test_candidate.TestCandidateLogin::test_TC_CAND_001_login_page_elements',
      testName: 'test_TC_CAND_001_login_page_elements',
      passed: true,
      details: 'Passed.',
    });

    const failed = results.find((r) => r.testId.endsWith('test_TC_CAND_002_bad_password'));
    expect(failed?.passed).toBe(false);
    expect(failed?.details).toContain('AssertionError: expected error banner');

    const errored = results.find((r) => r.testId.endsWith('test_admin_dashboard_loads'));
    expect(errored?.passed).toBe(false);
    expect(errored?.details).toContain('TimeoutError: locator not found');

    // Per the user: a skip is counted as a failure, not a pass.
    const skipped = results.find((r) => r.testId.endsWith('test_mentor_calendar_sync'));
    expect(skipped?.passed).toBe(false);
    expect(skipped?.details).toBe('SKIPPED: requires calendar integration credentials');
  });

  it('parses a legacy bare <testsuite> root (no <testsuites> wrapper)', () => {
    const results = parseJunitXml(LEGACY_BARE_TESTSUITE_XML);

    expect(results).toEqual([
      {
        testId: 'tests.test_employer::test_employer_login',
        testName: 'test_employer_login',
        passed: true,
        details: 'Passed.',
      },
    ]);
  });

  it('parses a real-world-sized report with far more than 1000 escaped entities without throwing', () => {
    // A real production run against the ~15,600-line curatal_tests suite hit
    // fast-xml-parser's default entity-expansion guard (maxTotalExpansions:
    // 1000) — many failure messages/tracebacks legitimately contain lots of
    // &amp;/&lt;/&quot; from HTML/JS content in test names. 1200 testcases,
    // each with one failure message containing 2 escaped entities, is 2400
    // total expansions — comfortably over the old default, comfortably
    // under the new one.
    const testcases = Array.from(
      { length: 1200 },
      (_, i) =>
        `<testcase classname="tests.test_bulk" name="test_${i}" time="0.1">
      <failure message="Expected &quot;a &amp; b&quot; but got something else">Expected &quot;a &amp; b&quot;</failure>
    </testcase>`,
    ).join('\n');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" errors="0" failures="1200" skipped="0" tests="1200" time="600">
    ${testcases}
  </testsuite>
</testsuites>`;

    const results = parseJunitXml(xml);

    expect(results).toHaveLength(1200);
    expect(results.every((r) => !r.passed)).toBe(true);
  });
});
