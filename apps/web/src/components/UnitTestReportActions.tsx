import type { UnitTestReportFormat } from '@cqp/core';
import {
  downloadUnitTestReport,
  useGenerateUnitTestReport,
  useUnitTestReports,
} from '../api/hooks.js';

const FORMATS: UnitTestReportFormat[] = ['json', 'html', 'pdf'];

export function UnitTestReportActions({ runId }: { runId: string }) {
  const reportsQuery = useUnitTestReports(runId);
  const generate = useGenerateUnitTestReport(runId);

  const existing = new Map((reportsQuery.data ?? []).map((r) => [r.format, r]));

  return (
    <div className="flex flex-wrap gap-2">
      {FORMATS.map((format) => {
        const report = existing.get(format);
        return (
          <div key={format} className="flex items-center gap-1 rounded border px-2 py-1 text-sm">
            <span className="uppercase text-neutral-600">{format}</span>
            <button
              onClick={() => generate.mutate(format)}
              disabled={generate.isPending}
              className="text-blue-600 hover:underline disabled:opacity-50"
            >
              {report ? 'Regenerate' : 'Generate'}
            </button>
            {report && (
              <button
                onClick={() => downloadUnitTestReport(report)}
                className="text-blue-600 hover:underline"
              >
                Download
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
