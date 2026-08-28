import type { StagingTestResult } from '@cqp/core';

/**
 * One line of `pytest-reportlog`'s `--report-log=<path>` JSON-Lines output
 * (packaged separately from pytest core since ~8.0, see requirements.txt).
 * Only `TestReport` lines carry per-test outcome data -- `CollectReport`,
 * `SessionStart`, `SessionFinish`, `WarningMessage`, etc. are all ignored.
 * `longrepr`'s exact shape varies by outcome/pytest version: a plain string,
 * a `(path, lineno, reason)`-shaped tuple for a marker skip, or a
 * `{ reprcrash: { message } }`-shaped object for a crash -- handled
 * defensively in `extractLongreprMessage` rather than assumed.
 */
interface ReportLogLine {
  $report_type?: string;
  nodeid?: string;
  when?: 'setup' | 'call' | 'teardown';
  outcome?: 'passed' | 'failed' | 'skipped';
  longrepr?: unknown;
}

interface NodeReports {
  setup?: ReportLogLine;
  call?: ReportLogLine;
  teardown?: ReportLogLine;
}

function extractLongreprMessage(longrepr: unknown): string {
  if (longrepr === null || longrepr === undefined) return '';
  if (typeof longrepr === 'string') return longrepr.trim();
  if (Array.isArray(longrepr)) {
    // Marker-skip reason is commonly serialized as [file, lineno, reason].
    const last = longrepr[longrepr.length - 1];
    return typeof last === 'string' ? last.trim() : '';
  }
  if (typeof longrepr === 'object') {
    const record = longrepr as Record<string, unknown>;
    const reprcrash = record.reprcrash as Record<string, unknown> | undefined;
    if (typeof reprcrash?.message === 'string') return reprcrash.message.trim();
    if (typeof record.message === 'string') return record.message.trim();
  }
  return '';
}

/**
 * pytest's native nodeid (`tests/roles/panel_admin/test_x.py::TestFoo::test_bar`)
 * uses a different shape than JUnit's `classname::name` (`tests.roles.panel_admin.test_x.TestFoo::test_bar`,
 * a dotted module path). Recovered results must use the SAME shape
 * `parseJunitXml` produces for the same test, or a recovered row's testId
 * would be indistinguishable-in-theory but mismatched-in-practice from a
 * normal run's -- breaking rerun-by-name resolution and quarantine-stub
 * matching for anything recovered this way.
 */
function nodeIdToTestId(nodeId: string): { testId: string; testName: string } {
  const segments = nodeId.split('::');
  const filePath = segments[0] ?? nodeId;
  const dottedFile = filePath.replace(/\.py$/, '').replace(/\//g, '.');
  const testName = segments[segments.length - 1] ?? nodeId;
  const middleSegments = segments.slice(1, -1);
  const classname = [dottedFile, ...middleSegments].join('.');
  return { testId: `${classname}::${testName}`, testName };
}

/**
 * Parses `pytest-reportlog`'s JSON-Lines output into `StagingTestResult[]`,
 * mirroring `parseJunitXml`'s shape and failure > error > skipped > pass
 * precedence -- used as a fallback when the normal `--junitxml` report was
 * never written (a SIGKILL-on-hang mid-batch never lets pytest finish its
 * session, so junitxml's single end-of-run write never happens; see
 * docs/adr/0057). `pytest-reportlog` flushes each line to disk as it's
 * produced, so a SIGKILL only ever loses the one line that was mid-write.
 */
export function parseReportLog(jsonl: string): StagingTestResult[] {
  const byNodeId = new Map<string, NodeReports>();

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: ReportLogLine;
    try {
      parsed = JSON.parse(trimmed) as ReportLogLine;
    } catch {
      // Expected shape of a SIGKILL-truncated final line (killed mid-write)
      // -- drop it, don't throw. Every complete line before it is still
      // valid and still worth recovering.
      console.error(
        `[staging] skipped an unreadable report-log line (likely truncated by a hang-kill): ${trimmed.slice(0, 200)}`,
      );
      continue;
    }

    if (parsed.$report_type !== 'TestReport' || !parsed.nodeid || !parsed.when) continue;

    const entry = byNodeId.get(parsed.nodeid) ?? {};
    entry[parsed.when] = parsed;
    byNodeId.set(parsed.nodeid, entry);
  }

  const results: StagingTestResult[] = [];
  for (const [nodeId, reports] of byNodeId) {
    const { setup, call, teardown } = reports;
    const { testId, testName } = nodeIdToTestId(nodeId);

    if (call?.outcome === 'failed') {
      results.push({
        testId,
        testName,
        passed: false,
        details: extractLongreprMessage(call.longrepr) || 'Test failed (no message recorded).',
      });
    } else if (setup?.outcome === 'failed') {
      // Fixture/setup blew up before the test body ever ran -- JUnit's
      // <error>, not <failure>.
      results.push({
        testId,
        testName,
        passed: false,
        details: extractLongreprMessage(setup.longrepr) || 'Test errored (no message recorded).',
      });
    } else if (setup?.outcome === 'skipped' || call?.outcome === 'skipped') {
      const reason =
        extractLongreprMessage(call?.longrepr) ||
        extractLongreprMessage(setup?.longrepr) ||
        'no reason recorded';
      results.push({ testId, testName, passed: false, details: `SKIPPED: ${reason}` });
    } else if (call?.outcome === 'passed') {
      const teardownNote =
        teardown?.outcome === 'failed'
          ? ` (teardown also reported an error — see the full report-log for details)`
          : '';
      results.push({ testId, testName, passed: true, details: `Passed.${teardownNote}` });
    }
    // else: setup ran (or nothing conclusive did) but `call` never reported
    // -- this is the test that was still executing when the process was
    // killed. Its outcome is genuinely unknown and must not be fabricated
    // as a pass or fail, so it's deliberately excluded here rather than
    // added with a guessed status.
  }

  return results;
}
