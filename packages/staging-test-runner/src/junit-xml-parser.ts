import { XMLParser } from 'fast-xml-parser';
import type { StagingTestResult } from '@cqp/core';

interface RawFailure {
  '@_message'?: string;
  '#text'?: string;
}

interface RawTestCase {
  '@_classname'?: string;
  '@_name': string;
  failure?: RawFailure | RawFailure[];
  error?: RawFailure | RawFailure[];
  skipped?: RawFailure | RawFailure[];
}

interface RawTestSuite {
  testcase?: RawTestCase | RawTestCase[];
}

interface RawRoot {
  testsuites?: { testsuite?: RawTestSuite | RawTestSuite[] };
  testsuite?: RawTestSuite | RawTestSuite[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function firstMessage(entries: RawFailure[]): string {
  const entry = entries[0];
  if (!entry) return '';
  return entry['#text']?.trim() || entry['@_message'] || '';
}

/**
 * Parses pytest's `--junitxml` output (both the legacy bare `<testsuite>`
 * root and the xunit2-style `<testsuites>` wrapper pytest defaults to) into
 * StagingTestResult rows. `testId` combines the JUnit `classname` + `name`
 * attributes rather than pytest's own `::`-separated node-ID syntax, since
 * JUnit XML never records that form directly — this is equally unique and
 * stable for our purposes (matching a result back to the same real test
 * run to run).
 */
export function parseJunitXml(xml: string): StagingTestResult[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    // fast-xml-parser's default entity-expansion guard (maxTotalExpansions:
    // 1000) is meant to stop a malicious/adversarial XML payload — this XML
    // is our own pytest subprocess's real output, not untrusted input, and
    // a real report with hundreds of failure messages/tracebacks (each
    // full of &amp;/&lt;/&quot; from HTML/JS content in test names) easily
    // exceeds 1000 entities legitimately. Raised generously, not disabled
    // outright, so an actually-malformed/adversarial file still gets caught.
    processEntities: { maxTotalExpansions: 100_000, maxExpandedLength: 10_000_000 },
  });
  const parsed = parser.parse(xml) as RawRoot;
  const suites = toArray(parsed.testsuites?.testsuite ?? parsed.testsuite);

  const results: StagingTestResult[] = [];
  for (const suite of suites) {
    for (const testcase of toArray(suite.testcase)) {
      const classname = testcase['@_classname'] ?? '';
      const name = testcase['@_name'];
      const testId = classname ? `${classname}::${name}` : name;

      const failures = toArray(testcase.failure);
      const errors = toArray(testcase.error);
      const skipped = toArray(testcase.skipped);

      if (failures.length > 0) {
        results.push({
          testId,
          testName: name,
          passed: false,
          details: firstMessage(failures) || 'Test failed (no message recorded).',
        });
      } else if (errors.length > 0) {
        results.push({
          testId,
          testName: name,
          passed: false,
          details: firstMessage(errors) || 'Test errored (no message recorded).',
        });
      } else if (skipped.length > 0) {
        // Per the user: a skipped test is not a pass — counted (and
        // alerted on) as a failure, same as a real FAILED/ERROR outcome.
        // The `SKIPPED:` detail prefix is what the reporting layer keys
        // off of to break it out into its own section instead of trying
        // to classify it as a real traceback (docs/adr/0036).
        results.push({
          testId,
          testName: name,
          passed: false,
          details: `SKIPPED: ${firstMessage(skipped) || 'no reason recorded'}`,
        });
      } else {
        results.push({ testId, testName: name, passed: true, details: 'Passed.' });
      }
    }
  }
  return results;
}
