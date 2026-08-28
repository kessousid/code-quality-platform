import { describe, expect, it } from 'vitest';
import { parseReportLog } from './report-log-parser.js';

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('parseReportLog', () => {
  it('parses a fully-completed passed test (setup + call + teardown all passed)', () => {
    const jsonl = [
      line({ $report_type: 'SessionStart' }),
      line({
        $report_type: 'TestReport',
        nodeid:
          'tests/roles/panel_admin/test_paneladmin.py::TestPanelAdminLogin::test_TC_PANELADMIN_048[chromium]',
        when: 'setup',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid:
          'tests/roles/panel_admin/test_paneladmin.py::TestPanelAdminLogin::test_TC_PANELADMIN_048[chromium]',
        when: 'call',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid:
          'tests/roles/panel_admin/test_paneladmin.py::TestPanelAdminLogin::test_TC_PANELADMIN_048[chromium]',
        when: 'teardown',
        outcome: 'passed',
      }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      {
        testId:
          'tests.roles.panel_admin.test_paneladmin.TestPanelAdminLogin::test_TC_PANELADMIN_048[chromium]',
        testName: 'test_TC_PANELADMIN_048[chromium]',
        passed: true,
        details: 'Passed.',
      },
    ]);
  });

  it('parses a module-level test with no enclosing class (no middle nodeid segment)', () => {
    const jsonl = [
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/auth/test_login.py::test_login_valid',
        when: 'setup',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/auth/test_login.py::test_login_valid',
        when: 'call',
        outcome: 'passed',
      }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      {
        testId: 'tests.auth.test_login::test_login_valid',
        testName: 'test_login_valid',
        passed: true,
        details: 'Passed.',
      },
    ]);
  });

  it('classifies a call-phase failure as a real failure, using the call longrepr', () => {
    const jsonl = [
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_y',
        when: 'setup',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_y',
        when: 'call',
        outcome: 'failed',
        longrepr: { reprcrash: { message: 'AssertionError: boom' } },
      }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      {
        testId: 'tests.x::test_y',
        testName: 'test_y',
        passed: false,
        details: 'AssertionError: boom',
      },
    ]);
  });

  it('classifies a setup-phase failure as an error (fixture blew up before the test body ran)', () => {
    const jsonl = line({
      $report_type: 'TestReport',
      nodeid: 'tests/x.py::test_y',
      when: 'setup',
      outcome: 'failed',
      longrepr: 'RuntimeError: fixture exploded',
    });

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      {
        testId: 'tests.x::test_y',
        testName: 'test_y',
        passed: false,
        details: 'RuntimeError: fixture exploded',
      },
    ]);
  });

  it('classifies a marker-based skip (setup skipped, no call phase at all) as SKIPPED, not excluded', () => {
    const jsonl = line({
      $report_type: 'TestReport',
      nodeid: 'tests/x.py::test_y',
      when: 'setup',
      outcome: 'skipped',
      longrepr: ['tests/x.py', 12, 'Skipped: not ready yet'],
    });

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      {
        testId: 'tests.x::test_y',
        testName: 'test_y',
        passed: false,
        details: 'SKIPPED: Skipped: not ready yet',
      },
    ]);
  });

  it('falls back to "no reason recorded" for a skip with no usable longrepr', () => {
    const jsonl = line({
      $report_type: 'TestReport',
      nodeid: 'tests/x.py::test_y',
      when: 'setup',
      outcome: 'skipped',
    });

    const results = parseReportLog(jsonl);

    expect(results[0]?.details).toBe('SKIPPED: no reason recorded');
  });

  it('excludes a test that was still in-flight when the process was killed (setup passed, no call ever reported)', () => {
    const jsonl = [
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_done',
        when: 'setup',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_done',
        when: 'call',
        outcome: 'passed',
      }),
      // test_hung's setup completed, but the kill happened mid-call -- no
      // call-phase (or teardown) report was ever flushed for it.
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_hung',
        when: 'setup',
        outcome: 'passed',
      }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toHaveLength(1);
    expect(results[0]?.testId).toBe('tests.x::test_done');
  });

  it('ignores non-TestReport lines (SessionStart, CollectReport, etc.)', () => {
    const jsonl = [
      line({ $report_type: 'SessionStart', pytest_version: '9.1.1' }),
      line({ $report_type: 'CollectReport', nodeid: 'tests/x.py', outcome: 'passed' }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_y',
        when: 'call',
        outcome: 'passed',
      }),
      line({ $report_type: 'SessionFinish', exitstatus: 0 }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toEqual([
      { testId: 'tests.x::test_y', testName: 'test_y', passed: true, details: 'Passed.' },
    ]);
  });

  it('drops a truncated/malformed final line without throwing, keeping every well-formed line before it', () => {
    const wellFormed = [
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_a',
        when: 'call',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_b',
        when: 'call',
        outcome: 'passed',
      }),
    ];
    // Simulates a SIGKILL landing mid-write of the final JSON object.
    const truncated = '{"$report_type": "TestReport", "nodeid": "tests/x.py::test_c", "when": "se';
    const jsonl = [...wellFormed, truncated].join('\n');

    const results = parseReportLog(jsonl);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.testId)).toEqual(['tests.x::test_a', 'tests.x::test_b']);
  });

  it('reports a passed test with a note when only its teardown phase failed', () => {
    const jsonl = [
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_y',
        when: 'call',
        outcome: 'passed',
      }),
      line({
        $report_type: 'TestReport',
        nodeid: 'tests/x.py::test_y',
        when: 'teardown',
        outcome: 'failed',
      }),
    ].join('\n');

    const results = parseReportLog(jsonl);

    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.details).toContain('teardown also reported an error');
  });

  it('returns an empty array for an empty report-log', () => {
    expect(parseReportLog('')).toEqual([]);
  });
});
