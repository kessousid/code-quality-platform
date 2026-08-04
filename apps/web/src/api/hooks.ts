import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnalysisCategory,
  CoverageFileResult,
  CoverageReport,
  CoverageReportFormat,
  CoverageRun,
  CreateRepoInput,
  CreateScanInput,
  CronDefinition,
  CronEnvironment,
  CronRun,
  Finding,
  GeneratedTestFile,
  PaginatedResult,
  QaAutomationEnvironment,
  QaAutomationReport,
  QaAutomationReportFormat,
  QaAutomationRun,
  QaAutomationSchedule,
  QaAutomationStagingSchedule,
  QaAutomationTestResult,
  Report,
  ReportFormat,
  Repo,
  Scan,
  TestCaseResult,
  TestGeneratorType,
  UnitTestReport,
  UnitTestReportFormat,
  UnitTestRun,
  UnitTestTarget,
} from '@cqp/core';
import type { ReportSummary } from '@cqp/reporting';
import { apiGet, apiGetBlob, apiPost, apiPut } from './client.js';

export function useRepos(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['repos', page, pageSize],
    queryFn: () => apiGet<PaginatedResult<Repo>>(`/repos?page=${page}&pageSize=${pageSize}`),
  });
}

export function useRepo(repoId: string | undefined) {
  return useQuery({
    queryKey: ['repo', repoId],
    queryFn: () => apiGet<Repo>(`/repos/${repoId}`),
    enabled: repoId !== undefined,
  });
}

export function useCreateRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<CreateRepoInput, 'name' | 'localPath' | 'workerId'>) =>
      apiPost<Repo>('/repos', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function useScans(repoId: string | undefined, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['scans', repoId, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedResult<Scan>>(`/scans?repoId=${repoId}&page=${page}&pageSize=${pageSize}`),
    enabled: repoId !== undefined,
    refetchInterval: (query) => {
      const scans = query.state.data?.data ?? [];
      const hasActive = scans.some((s) => s.status === 'queued' || s.status === 'running');
      return hasActive ? 2000 : false;
    },
  });
}

export function useCreateScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<CreateScanInput, 'repoId' | 'ref' | 'mode' | 'categories'>) =>
      apiPost<Scan>('/scans', input),
    onSuccess: (scan) => queryClient.invalidateQueries({ queryKey: ['scans', scan.repoId] }),
  });
}

const NON_TERMINAL_STATUSES: Scan['status'][] = ['queued', 'running'];

/** Polls every 2s while the scan hasn't reached a terminal status — this is what drives the live progress bar. */
export function useScan(scanId: string | undefined) {
  return useQuery({
    queryKey: ['scan', scanId],
    queryFn: () => apiGet<Scan>(`/scans/${scanId}`),
    enabled: scanId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status !== undefined && NON_TERMINAL_STATUSES.includes(status) ? 2000 : false;
    },
  });
}

export function useCancelScan(scanId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<Scan>(`/scans/${scanId}/cancel`),
    onSuccess: (scan) => {
      queryClient.invalidateQueries({ queryKey: ['scan', scan.id] });
      queryClient.invalidateQueries({ queryKey: ['scans', scan.repoId] });
    },
  });
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface BrowseDirectoryResult {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

/**
 * Backs the folder/file picker on the "add repo" and "generate unit tests"
 * forms — see docs/adr/0023, docs/adr/0024. `workerId` (docs/adr/0032)
 * routes the browse request to that specific worker's own filesystem
 * instead of the API's — required once the API and the repo's worker can
 * be different machines; omit it only for a genuinely single-machine setup.
 */
export function useBrowseDirectory(
  path: string | undefined,
  includeFiles = false,
  workerId?: string,
) {
  return useQuery({
    queryKey: ['fs-browse', path, includeFiles, workerId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (path) params.set('path', path);
      if (includeFiles) params.set('includeFiles', 'true');
      if (workerId) params.set('workerId', workerId);
      const query = params.toString();
      return apiGet<BrowseDirectoryResult>(`/fs/browse${query ? `?${query}` : ''}`);
    },
    // A failure here (bad path, or docs/adr/0032's "no worker responded within
    // 10000ms") isn't transient — retrying the identical request won't change
    // the outcome. Without this, React Query's default 3 retries turned an
    // ~11s worker-timeout into a ~50s+ wait before the error ever showed,
    // which just looked like Browse… was stuck on "Loading…" forever.
    retry: false,
  });
}

export const SCAN_CATEGORIES: { value: AnalysisCategory; label: string }[] = [
  { value: 'security', label: 'Security' },
  { value: 'code-quality', label: 'Code quality' },
  { value: 'secret-detection', label: 'Secret detection' },
  { value: 'dependency-vulnerability', label: 'Dependency vulnerabilities' },
  { value: 'architecture', label: 'Architecture' },
];

export function useScanSummary(scanId: string | undefined) {
  return useQuery({
    queryKey: ['scan-summary', scanId],
    queryFn: () => apiGet<ReportSummary>(`/scans/${scanId}/summary`),
    enabled: scanId !== undefined,
  });
}

export function useScanFindings(scanId: string | undefined) {
  return useQuery({
    queryKey: ['scan-findings', scanId],
    queryFn: () => apiGet<Finding[]>(`/scans/${scanId}/findings`),
    enabled: scanId !== undefined,
  });
}

export interface RepoTrendPoint {
  scan: Scan;
  summary: ReportSummary;
}

/**
 * One point per scan, oldest first, for the health-trend chart. N+1
 * queries (scans, then a summary per scan) — acceptable at the repo-scan
 * counts this MVP targets; revisit with a dedicated bulk endpoint if that
 * changes.
 */
export function useRepoHealthTrend(repoId: string | undefined) {
  const scansQuery = useScans(repoId, 1, 50);
  const scans = scansQuery.data?.data ?? [];
  const scanIds = scans.map((s) => s.id);

  return useQuery({
    queryKey: ['repo-trend', repoId, scanIds],
    queryFn: async (): Promise<RepoTrendPoint[]> => {
      const summaries = await Promise.all(
        scanIds.map((id) => apiGet<ReportSummary>(`/scans/${id}/summary`)),
      );
      // `scan.createdAt` is typed as `Date` in @cqp/core but arrives over
      // the wire as an ISO string — `fetch().json()` never revives dates.
      // `new Date(...)` handles both a string and an already-real Date.
      return scans
        .map((scan, i) => ({ scan, summary: summaries[i]! }))
        .sort(
          (a, b) => new Date(a.scan.createdAt).valueOf() - new Date(b.scan.createdAt).valueOf(),
        );
    },
    enabled: scansQuery.data !== undefined,
  });
}

export function useReports(scanId: string | undefined) {
  return useQuery({
    queryKey: ['reports', scanId],
    queryFn: () => apiGet<Report[]>(`/scans/${scanId}/reports`),
    enabled: scanId !== undefined,
  });
}

export function useGenerateReport(scanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (format: ReportFormat) => apiPost<Report>(`/scans/${scanId}/reports`, { format }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', scanId] }),
  });
}

/** Interim, no password/verification yet — see docs/adr/0022. */
export function useLoginWithEmail() {
  return useMutation({
    mutationFn: (email: string) => apiPost<{ status: string }>('/auth/login', { email }),
  });
}

const REPORT_EXTENSION: Record<ReportFormat, string> = {
  json: 'json',
  sarif: 'sarif.json',
  html: 'html',
  pdf: 'pdf',
};

/** Downloads a report's real bytes and saves them via a throwaway anchor — no dedicated endpoint hook needed, this isn't cached query state. */
export async function downloadReport(report: Report): Promise<void> {
  const blob = await apiGetBlob(`/reports/${report.id}/content`);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `report-${report.scanId}.${REPORT_EXTENSION[report.format]}`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** See docs/adr/0024 — generate + run Jest tests for a target within a repo. */

export function useUnitTestRuns(repoId: string | undefined, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['unit-test-runs', repoId, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedResult<UnitTestRun>>(
        `/unit-tests?repoId=${repoId}&page=${page}&pageSize=${pageSize}`,
      ),
    enabled: repoId !== undefined,
    refetchInterval: (query) => {
      const runs = query.state.data?.data ?? [];
      const hasActive = runs.some((r) => r.status === 'queued' || r.status === 'running');
      return hasActive ? 2000 : false;
    },
  });
}

export function useCreateUnitTestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      repoId: string;
      target: UnitTestTarget;
      generator?: TestGeneratorType;
      apiKeyOverride?: string;
    }) => apiPost<UnitTestRun>('/unit-tests', input),
    onSuccess: (run) => queryClient.invalidateQueries({ queryKey: ['unit-test-runs', run.repoId] }),
  });
}

const NON_TERMINAL_RUN_STATUSES: UnitTestRun['status'][] = ['queued', 'running'];

/** Polls every 2s while the run hasn't reached a terminal status — drives the live progress bar, same pattern as useScan. */
export function useUnitTestRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['unit-test-run', runId],
    queryFn: () => apiGet<UnitTestRun>(`/unit-tests/${runId}`),
    enabled: runId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status !== undefined && NON_TERMINAL_RUN_STATUSES.includes(status) ? 2000 : false;
    },
  });
}

/**
 * Awaits a unit test run reaching a terminal status by polling directly
 * (not a hook — for use inside an event handler that needs to await
 * completion before moving to a next step, e.g. "generate tests, then
 * re-run the coverage gate"). Throws if it doesn't finish within
 * `maxWaitMs` rather than polling forever.
 */
export async function waitForUnitTestRunToFinish(
  runId: string,
  { intervalMs = 1000, maxWaitMs = 120000 }: { intervalMs?: number; maxWaitMs?: number } = {},
): Promise<UnitTestRun> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const run = await apiGet<UnitTestRun>(`/unit-tests/${runId}`);
    if (!NON_TERMINAL_RUN_STATUSES.includes(run.status)) return run;
    if (Date.now() >= deadline) {
      throw new Error(`Unit test run ${runId} did not finish within ${maxWaitMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function useCancelUnitTestRun(runId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<UnitTestRun>(`/unit-tests/${runId}/cancel`),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['unit-test-run', run.id] });
      queryClient.invalidateQueries({ queryKey: ['unit-test-runs', run.repoId] });
    },
  });
}

export function useUnitTestResults(runId: string | undefined) {
  return useQuery({
    queryKey: ['unit-test-results', runId],
    queryFn: () => apiGet<TestCaseResult[]>(`/unit-tests/${runId}/results`),
    enabled: runId !== undefined,
  });
}

export function useUnitTestGeneratedFiles(runId: string | undefined) {
  return useQuery({
    queryKey: ['unit-test-generated-files', runId],
    queryFn: () => apiGet<GeneratedTestFile[]>(`/unit-tests/${runId}/generated-files`),
    enabled: runId !== undefined,
  });
}

/** Mirrors useReports/useGenerateReport/downloadReport above (docs/adr/0019, docs/adr/0024) — same pattern for UnitTestRun instead of Scan. */
export function useUnitTestReports(runId: string | undefined) {
  return useQuery({
    queryKey: ['unit-test-reports', runId],
    queryFn: () => apiGet<UnitTestReport[]>(`/unit-tests/${runId}/reports`),
    enabled: runId !== undefined,
  });
}

export function useGenerateUnitTestReport(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (format: UnitTestReportFormat) =>
      apiPost<UnitTestReport>(`/unit-tests/${runId}/reports`, { format }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unit-test-reports', runId] }),
  });
}

const UNIT_TEST_REPORT_EXTENSION: Record<UnitTestReportFormat, string> = {
  json: 'json',
  html: 'html',
  pdf: 'pdf',
  xlsx: 'xlsx',
};

/** Downloads a unit test report's real bytes and saves them via a throwaway anchor — same as downloadReport above. */
export async function downloadUnitTestReport(report: UnitTestReport): Promise<void> {
  const blob = await apiGetBlob(`/unit-test-reports/${report.id}/content`);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `unit-test-report-${report.unitTestRunId}.${UNIT_TEST_REPORT_EXTENSION[report.format]}`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** See docs/adr/0025 — zero-LLM coverage gate: diffs the working tree against a base ref, runs the repo's own Jest suite, and reports uncovered changed lines. */

export function useCoverageRuns(repoId: string | undefined, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['coverage-runs', repoId, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedResult<CoverageRun>>(
        `/coverage-runs?repoId=${repoId}&page=${page}&pageSize=${pageSize}`,
      ),
    enabled: repoId !== undefined,
    refetchInterval: (query) => {
      const runs = query.state.data?.data ?? [];
      const hasActive = runs.some((r) => r.status === 'queued' || r.status === 'running');
      return hasActive ? 2000 : false;
    },
  });
}

export function useCreateCoverageRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { repoId: string; baseRef?: string }) =>
      apiPost<CoverageRun>('/coverage-runs', input),
    onSuccess: (run) => queryClient.invalidateQueries({ queryKey: ['coverage-runs', run.repoId] }),
  });
}

const NON_TERMINAL_COVERAGE_STATUSES: CoverageRun['status'][] = ['queued', 'running'];

/** Polls every 2s while the run hasn't reached a terminal status — same pattern as useUnitTestRun. */
export function useCoverageRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['coverage-run', runId],
    queryFn: () => apiGet<CoverageRun>(`/coverage-runs/${runId}`),
    enabled: runId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status !== undefined && NON_TERMINAL_COVERAGE_STATUSES.includes(status) ? 2000 : false;
    },
  });
}

export function useCancelCoverageRun(runId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<CoverageRun>(`/coverage-runs/${runId}/cancel`),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-run', run.id] });
      queryClient.invalidateQueries({ queryKey: ['coverage-runs', run.repoId] });
    },
  });
}

export function useCoverageFileResults(runId: string | undefined) {
  return useQuery({
    queryKey: ['coverage-file-results', runId],
    queryFn: () => apiGet<CoverageFileResult[]>(`/coverage-runs/${runId}/results`),
    enabled: runId !== undefined,
  });
}

export function useCoverageReports(runId: string | undefined) {
  return useQuery({
    queryKey: ['coverage-reports', runId],
    queryFn: () => apiGet<CoverageReport[]>(`/coverage-runs/${runId}/reports`),
    enabled: runId !== undefined,
  });
}

export function useGenerateCoverageReport(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (format: CoverageReportFormat) =>
      apiPost<CoverageReport>(`/coverage-runs/${runId}/reports`, { format }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coverage-reports', runId] }),
  });
}

const COVERAGE_REPORT_EXTENSION: Record<CoverageReportFormat, string> = {
  json: 'json',
  html: 'html',
  pdf: 'pdf',
};

/** Downloads a coverage report's real bytes and saves them via a throwaway anchor — same as downloadUnitTestReport above. */
export async function downloadCoverageReport(report: CoverageReport): Promise<void> {
  const blob = await apiGetBlob(`/coverage-reports/${report.id}/content`);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `coverage-report-${report.coverageRunId}.${COVERAGE_REPORT_EXTENSION[report.format]}`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CronsListResponse {
  crons: CronDefinition[];
  environments: CronEnvironment[];
}

/** See docs/adr/0033 — definitions are static, not org-scoped, so this is the same for every org. */
export function useCrons() {
  return useQuery({
    queryKey: ['crons'],
    queryFn: () => apiGet<CronsListResponse>('/crons'),
  });
}

/** Blocking on purpose (docs/adr/0033) — the mutation's own pending state IS the "live status" while the external call runs. */
export function useTriggerCronRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cronId: string; environment: CronEnvironment }) =>
      apiPost<CronRun>('/cron-runs', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-runs'] }),
  });
}

export function useCronRuns(page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ['cron-runs', page, pageSize],
    queryFn: () => apiGet<PaginatedResult<CronRun>>(`/cron-runs?page=${page}&pageSize=${pageSize}`),
  });
}

export function useQaAutomationSchedule() {
  return useQuery({
    queryKey: ['qa-automation-schedule'],
    queryFn: () => apiGet<QaAutomationSchedule>('/qa-automation/schedule'),
  });
}

export function useUpdateQaAutomationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { intervalHours?: number; enabled?: boolean }) =>
      apiPut<QaAutomationSchedule>('/qa-automation/schedule', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qa-automation-schedule'] }),
  });
}

/** Fire-and-forget — the real run happens asynchronously on apps/qa-automation; refetching run history after a short delay is how the new run shows up. */
export function useTriggerQaAutomationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ status: 'queued' }>('/qa-automation/runs'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qa-automation-runs'] }),
  });
}

/** `environment` defaults to 'production' server-side too — passing it explicitly keeps the staging history view separate. */
export function useQaAutomationRuns(
  page = 1,
  pageSize = 25,
  environment: QaAutomationEnvironment = 'production',
) {
  return useQuery({
    queryKey: ['qa-automation-runs', environment, page, pageSize],
    queryFn: () =>
      apiGet<PaginatedResult<QaAutomationRun>>(
        `/qa-automation/runs?page=${page}&pageSize=${pageSize}&environment=${environment}`,
      ),
  });
}

export function useQaAutomationStagingSchedule() {
  return useQuery({
    queryKey: ['qa-automation-staging-schedule'],
    queryFn: () => apiGet<QaAutomationStagingSchedule>('/qa-automation/staging/schedule'),
  });
}

export function useUpdateQaAutomationStagingSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled?: boolean }) =>
      apiPut<QaAutomationStagingSchedule>('/qa-automation/staging/schedule', input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['qa-automation-staging-schedule'] }),
  });
}

/** Fire-and-forget, same shape as useTriggerQaAutomationRun — refetches the staging run history, not production's. */
export function useTriggerQaAutomationStagingRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ status: 'queued' }>('/qa-automation/staging/runs'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qa-automation-runs', 'staging'] }),
  });
}

export interface QaAutomationRunWithResults extends QaAutomationRun {
  results: QaAutomationTestResult[];
}

/** Only fetched once a run row is expanded — the list endpoint doesn't carry per-test results. */
export function useQaAutomationRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['qa-automation-run', runId],
    queryFn: () => apiGet<QaAutomationRunWithResults>(`/qa-automation/runs/${runId}`),
    enabled: runId !== undefined,
  });
}

/** Mirrors useUnitTestReports/useGenerateUnitTestReport/downloadUnitTestReport — same pattern for QaAutomationRun instead of UnitTestRun. */
export function useQaAutomationReports(runId: string | undefined) {
  return useQuery({
    queryKey: ['qa-automation-reports', runId],
    queryFn: () => apiGet<QaAutomationReport[]>(`/qa-automation/runs/${runId}/reports`),
    enabled: runId !== undefined,
  });
}

export function useGenerateQaAutomationReport(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (format: QaAutomationReportFormat) =>
      apiPost<QaAutomationReport>(`/qa-automation/runs/${runId}/reports`, { format }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qa-automation-reports', runId] }),
  });
}

/** Downloads a QA automation report's real bytes and saves them via a throwaway anchor — same as downloadUnitTestReport. */
export async function downloadQaAutomationReport(report: QaAutomationReport): Promise<void> {
  const blob = await apiGetBlob(`/qa-automation-reports/${report.id}/content`);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qa-automation-report-${report.runId}.${report.format}`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
