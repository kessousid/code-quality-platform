import { useState } from 'react';
import type { TestCaseResult } from '@cqp/core';

interface TestResultsListProps {
  results: TestCaseResult[];
}

const STATUS_STYLE: Record<TestCaseResult['status'], string> = {
  passed: 'text-green-600',
  failed: 'text-red-600',
  skipped: 'text-neutral-400',
};

const STATUS_ICON: Record<TestCaseResult['status'], string> = {
  passed: '✓',
  failed: '✗',
  skipped: '○',
};

/** Split out of UnitTestRunDetailPage to keep that component's own branching simple (mirrors ScanStatusHeader/UnitTestRunStatusPanel). */
export function TestResultsList({ results }: TestResultsListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (results.length === 0) {
    return <p className="text-sm text-neutral-500">No results yet.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border text-sm">
      {results.map((result) => (
        <li key={result.id}>
          <button
            type="button"
            onClick={() => setExpanded((current) => (current === result.id ? null : result.id))}
            className="flex w-full items-center justify-between p-3 text-left"
            disabled={!result.failureMessage}
          >
            <span>
              <span className={STATUS_STYLE[result.status]}>{STATUS_ICON[result.status]}</span>{' '}
              {result.testName}
            </span>
            <span className="text-xs text-neutral-500">
              {result.testFilePath}
              {result.durationMs !== undefined ? ` · ${result.durationMs}ms` : ''}
            </span>
          </button>
          {expanded === result.id && result.failureMessage && (
            <pre className="overflow-x-auto whitespace-pre-wrap bg-neutral-50 p-3 text-xs text-red-700">
              {result.failureMessage}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
