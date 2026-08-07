import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A real, minimal HTTP server standing in for `apps/api` in frontend
 * tests — real TCP, real JSON over the wire, no `fetch` mocking. It
 * implements just the slice of the contract the frontend hooks call
 * (see apps/api's actual controllers for the real implementation this
 * mirrors). Kept in apps/web's own test tree rather than depending on
 * `@cqp/api` directly, which would be a backwards dependency (frontend
 * depending on the backend *application*, not just its domain types).
 */
export interface Repo {
  id: string;
  orgId: string;
  name: string;
  provider: string;
  localPath?: string;
  workerId: string;
  defaultBranch: string;
  createdAt: string;
}

export interface Scan {
  id: string;
  orgId: string;
  repoId: string;
  ref: string;
  mode: string;
  status: string;
  createdAt: string;
  categories?: string[];
  pluginsTotal?: number;
  pluginsCompleted?: number;
  currentPluginId?: string;
}

export interface DirectoryFixture {
  path: string;
  parent: string | null;
  entries: { name: string; path: string; type: 'file' | 'directory' }[];
}

export interface UnitTestRun {
  id: string;
  orgId: string;
  repoId: string;
  target: { path: string; functionName?: string };
  generator?: string;
  status: string;
  createdAt: string;
  filesTotal?: number;
  filesCompleted?: number;
  currentFilePath?: string;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  errorMessage?: string;
}

export interface CoverageRun {
  id: string;
  orgId: string;
  repoId: string;
  baseRef: string;
  status: string;
  createdAt: string;
  gatePassed?: boolean;
  filesTotal?: number;
  filesCompleted?: number;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  changedLinesTotal?: number;
  uncoveredLinesTotal?: number;
  errorMessage?: string;
}

export interface CronDefinitionFixture {
  id: string;
  name: string;
  path: string;
}

export interface CronRunFixture {
  id: string;
  orgId: string;
  cronId: string;
  cronName: string;
  environment: string;
  status: string;
  createdAt: string;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  completedAt?: string;
}

export interface QaAutomationScheduleFixture {
  intervalHours: number;
  enabled: boolean;
  lastDailyCheckAt?: string;
}

export interface QaAutomationStagingScheduleFixture {
  enabled: boolean;
}

export interface QaAutomationTestResultFixture {
  id: string;
  runId: string;
  testId: string;
  testName: string;
  passed: boolean;
  details: string;
  sourceUrl?: string;
  createdAt: string;
}

export interface QaAutomationRunFixture {
  id: string;
  orgId: string;
  environment: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  createdAt: string;
  completedAt?: string;
}

export interface QaAutomationReportFixture {
  id: string;
  orgId: string;
  runId: string;
  format: string;
  storageKey: string;
  createdAt: string;
}

export interface LocalApiServer {
  baseUrl: string;
  close: () => Promise<void>;
  repos: Repo[];
  scans: Scan[];
  findingsByScan: Map<string, unknown[]>;
  summaryByScan: Map<string, unknown>;
  reportsByScan: Map<string, unknown[]>;
  directories: Map<string, DirectoryFixture>;
  unitTestRuns: UnitTestRun[];
  /** Raw POST /unit-tests bodies, exactly as sent — lets a test verify e.g. apiKeyOverride was actually transmitted, since it's deliberately never echoed back on the stored/returned run. */
  receivedUnitTestCreateBodies: { apiKeyOverride?: string }[];
  resultsByRun: Map<string, unknown[]>;
  generatedFilesByRun: Map<string, unknown[]>;
  unitTestReportsByRun: Map<string, UnitTestReport[]>;
  coverageRuns: CoverageRun[];
  coverageFileResultsByRun: Map<string, unknown[]>;
  coverageReportsByRun: Map<string, unknown[]>;
  cronDefinitions: CronDefinitionFixture[];
  cronRuns: CronRunFixture[];
  qaAutomationSchedule: QaAutomationScheduleFixture;
  qaAutomationStagingSchedule: QaAutomationStagingScheduleFixture;
  qaAutomationRuns: QaAutomationRunFixture[];
  qaAutomationResultsByRun: Map<string, QaAutomationTestResultFixture[]>;
  qaAutomationReportsByRun: Map<string, QaAutomationReportFixture[]>;
  /** Pre-seed an account directly (bypassing the real signup/verify UI flow) for tests that only care about login/reset behavior. */
  mockUsers: Map<string, { password: string; status: 'pending_verification' | 'active' }>;
  /** The most recent signup/forgot-password "email" tokens — stands in for actually reading an inbox in tests. */
  authTokens: { verification?: string; reset?: string };
}

interface Report {
  id: string;
  orgId: string;
  scanId: string;
  format: string;
  storageKey: string;
  createdAt: string;
}

export interface UnitTestReport {
  id: string;
  orgId: string;
  unitTestRunId: string;
  format: string;
  storageKey: string;
  createdAt: string;
}

interface CoverageReport {
  id: string;
  orgId: string;
  coverageRunId: string;
  format: string;
  storageKey: string;
  createdAt: string;
}

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json',
): void {
  res.writeHead(status, { 'Content-Type': contentType });
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.end(body);
    return;
  }
  res.end(JSON.stringify(body));
}

function sendOrNotFound(res: ServerResponse, body: unknown): void {
  if (body === undefined) {
    send(res, 404, { message: 'not found' });
    return;
  }
  send(res, 200, body);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw.length > 0 ? JSON.parse(raw) : {};
}

export async function startLocalApiServer(): Promise<LocalApiServer> {
  const repos: Repo[] = [];
  const scans: Scan[] = [];
  const findingsByScan = new Map<string, unknown[]>();
  const summaryByScan = new Map<string, unknown>();
  const reportsByScan = new Map<string, Report[]>();
  const reportContent = new Map<string, string>();
  const directories = new Map<string, DirectoryFixture>();
  const unitTestRuns: UnitTestRun[] = [];
  const receivedUnitTestCreateBodies: { apiKeyOverride?: string }[] = [];
  const resultsByRun = new Map<string, unknown[]>();
  const generatedFilesByRun = new Map<string, unknown[]>();
  const unitTestReportsByRun = new Map<string, UnitTestReport[]>();
  const unitTestReportContent = new Map<string, string>();
  const coverageRuns: CoverageRun[] = [];
  const coverageFileResultsByRun = new Map<string, unknown[]>();
  const coverageReportsByRun = new Map<string, CoverageReport[]>();
  const coverageReportContent = new Map<string, string>();
  const cronDefinitions: CronDefinitionFixture[] = [
    {
      id: 'cod-candidate-search',
      name: 'Get COD Candidates',
      path: '/api/v1/cron/cod/candidate-search',
    },
  ];
  const cronRuns: CronRunFixture[] = [];
  const qaAutomationSchedule: QaAutomationScheduleFixture = { intervalHours: 12, enabled: true };
  const qaAutomationStagingSchedule: QaAutomationStagingScheduleFixture = { enabled: true };
  const qaAutomationRuns: QaAutomationRunFixture[] = [];
  const qaAutomationResultsByRun = new Map<string, QaAutomationTestResultFixture[]>();
  const qaAutomationReportsByRun = new Map<string, QaAutomationReportFixture[]>();
  const qaAutomationReportContent = new Map<string, Buffer>();
  const mockUsers = new Map<
    string,
    { password: string; status: 'pending_verification' | 'active' }
  >();
  const authTokens: { verification?: string; reset?: string } = {};

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { method } = req;
    const { pathname } = url;

    if (method === 'POST' && pathname === '/auth/session') {
      res.writeHead(201, { 'Set-Cookie': 'cqp_session=x; HttpOnly' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && pathname === '/auth/signup') {
      const { email, password } = await readJsonBody(req);
      if (!email?.endsWith('@curatal.com')) {
        send(res, 401, { message: 'Only @curatal.com email addresses may sign in' });
        return;
      }
      if (mockUsers.has(email)) {
        send(res, 409, { message: `${email} is already registered.` });
        return;
      }
      mockUsers.set(email, { password: password ?? '', status: 'pending_verification' });
      authTokens.verification = `verify-${email}`;
      send(res, 201, { status: 'ok' });
      return;
    }

    if (method === 'POST' && pathname === '/auth/verify-email') {
      const { token } = await readJsonBody(req);
      const email = typeof token === 'string' ? token.replace(/^verify-/, '') : undefined;
      const user = email ? mockUsers.get(email) : undefined;
      if (!user || token !== authTokens.verification) {
        send(res, 401, { message: 'This link is invalid or has expired.' });
        return;
      }
      user.status = 'active';
      res.writeHead(201, { 'Set-Cookie': 'cqp_session=x; HttpOnly' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && pathname === '/auth/login') {
      const { email, password } = await readJsonBody(req);
      if (!email?.endsWith('@curatal.com')) {
        send(res, 401, { message: 'Only @curatal.com email addresses may sign in' });
        return;
      }
      const user = mockUsers.get(email);
      if (!user || user.password !== password) {
        send(res, 401, { message: 'Invalid email or password.' });
        return;
      }
      if (user.status !== 'active') {
        send(res, 401, {
          message: 'Please verify your email before logging in — check your inbox for the link.',
        });
        return;
      }
      res.writeHead(201, { 'Set-Cookie': 'cqp_session=x; HttpOnly' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && pathname === '/auth/forgot-password') {
      const { email } = await readJsonBody(req);
      if (!email?.endsWith('@curatal.com')) {
        send(res, 401, { message: 'Only @curatal.com email addresses may sign in' });
        return;
      }
      if (mockUsers.has(email)) {
        authTokens.reset = `reset-${email}`;
      }
      send(res, 201, { status: 'ok' });
      return;
    }

    if (method === 'POST' && pathname === '/auth/reset-password') {
      const { token, password } = await readJsonBody(req);
      const email = typeof token === 'string' ? token.replace(/^reset-/, '') : undefined;
      const user = email ? mockUsers.get(email) : undefined;
      if (!user || token !== authTokens.reset) {
        send(res, 401, { message: 'This link is invalid or has expired.' });
        return;
      }
      user.password = password ?? '';
      user.status = 'active';
      delete authTokens.reset;
      res.writeHead(201, { 'Set-Cookie': 'cqp_session=x; HttpOnly' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && pathname === '/repos') {
      const input = await readJsonBody(req);
      const repo: Repo = {
        id: id('repo'),
        orgId: 'org_1',
        name: input.name ?? '',
        provider: 'local',
        workerId: input.workerId ?? 'default',
        defaultBranch: 'main',
        createdAt: new Date().toISOString(),
        ...(input.localPath ? { localPath: input.localPath } : {}),
      };
      repos.push(repo);
      send(res, 201, repo);
      return;
    }

    if (method === 'GET' && pathname === '/repos') {
      send(res, 200, { data: repos, total: repos.length, page: 1, pageSize: 25 });
      return;
    }

    const repoMatch = pathname.match(/^\/repos\/([^/]+)$/);
    if (method === 'GET' && repoMatch) {
      sendOrNotFound(
        res,
        repos.find((r) => r.id === repoMatch[1]),
      );
      return;
    }

    if (method === 'POST' && pathname === '/scans') {
      const input = (await readJsonBody(req)) as Record<string, unknown>;
      const scan: Scan = {
        id: id('scan'),
        orgId: 'org_1',
        repoId: (input.repoId as string) ?? '',
        ref: (input.ref as string) ?? '',
        mode: (input.mode as string) ?? 'full',
        status: 'queued',
        createdAt: new Date().toISOString(),
        ...(Array.isArray(input.categories) ? { categories: input.categories as string[] } : {}),
      };
      scans.push(scan);
      send(res, 201, scan);
      return;
    }

    const cancelMatch = pathname.match(/^\/scans\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      const scan = scans.find((s) => s.id === cancelMatch[1]);
      if (!scan) {
        send(res, 404, { message: 'not found' });
        return;
      }
      scan.status = 'cancelled';
      send(res, 201, scan);
      return;
    }

    if (method === 'GET' && pathname === '/fs/browse') {
      const path = url.searchParams.get('path') ?? '/';
      const workerId = url.searchParams.get('workerId');
      // Real shape of the docs/adr/0032 timeout error, for tests exercising that failure path without an actual 10s wait.
      if (workerId === 'unreachable-worker') {
        send(res, 400, {
          message: `No worker responded within 10000ms — is a worker actually running for this workerId?`,
          error: 'Bad Request',
          statusCode: 400,
        });
        return;
      }
      const fixture = directories.get(path);
      if (!fixture) {
        send(res, 200, { path, parent: null, entries: [] });
        return;
      }
      send(res, 200, fixture);
      return;
    }

    if (method === 'GET' && pathname === '/scans') {
      const repoId = url.searchParams.get('repoId');
      const filtered = scans.filter((s) => s.repoId === repoId);
      send(res, 200, { data: filtered, total: filtered.length, page: 1, pageSize: 25 });
      return;
    }

    const scanMatch = pathname.match(/^\/scans\/([^/]+)$/);
    if (method === 'GET' && scanMatch) {
      sendOrNotFound(
        res,
        scans.find((s) => s.id === scanMatch[1]),
      );
      return;
    }

    const summaryMatch = pathname.match(/^\/scans\/([^/]+)\/summary$/);
    if (method === 'GET' && summaryMatch) {
      sendOrNotFound(res, summaryByScan.get(summaryMatch[1]!));
      return;
    }

    const findingsMatch = pathname.match(/^\/scans\/([^/]+)\/findings$/);
    if (method === 'GET' && findingsMatch) {
      send(res, 200, findingsByScan.get(findingsMatch[1]!) ?? []);
      return;
    }

    const reportsListMatch = pathname.match(/^\/scans\/([^/]+)\/reports$/);
    if (method === 'GET' && reportsListMatch) {
      send(res, 200, reportsByScan.get(reportsListMatch[1]!) ?? []);
      return;
    }
    if (method === 'POST' && reportsListMatch) {
      const scanId = reportsListMatch[1]!;
      const { format } = await readJsonBody(req);
      const report: Report = {
        id: id('report'),
        orgId: 'org_1',
        scanId,
        format: format ?? 'json',
        storageKey: `k/${scanId}/${format}`,
        createdAt: new Date().toISOString(),
      };
      const list = reportsByScan.get(scanId) ?? [];
      reportsByScan.set(scanId, [...list.filter((r) => r.format !== report.format), report]);
      reportContent.set(
        report.id,
        JSON.stringify({
          findings: findingsByScan.get(scanId) ?? [],
          summary: summaryByScan.get(scanId),
        }),
      );
      send(res, 201, report);
      return;
    }

    const contentMatch = pathname.match(/^\/reports\/([^/]+)\/content$/);
    if (method === 'GET' && contentMatch) {
      const body = reportContent.get(contentMatch[1]!);
      if (body === undefined) {
        send(res, 404, { message: 'not found' });
        return;
      }
      send(res, 200, body, 'application/json');
      return;
    }

    if (method === 'POST' && pathname === '/unit-tests') {
      const input = (await readJsonBody(req)) as unknown as {
        repoId: string;
        target: { path: string; functionName?: string };
        generator?: string;
        apiKeyOverride?: string;
      };
      receivedUnitTestCreateBodies.push(
        input.apiKeyOverride !== undefined ? { apiKeyOverride: input.apiKeyOverride } : {},
      );
      const run: UnitTestRun = {
        id: id('run'),
        orgId: 'org_1',
        repoId: input.repoId ?? '',
        target: input.target ?? { path: '' },
        generator: input.generator ?? 'gemini',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      unitTestRuns.push(run);
      send(res, 201, run);
      return;
    }

    if (method === 'GET' && pathname === '/unit-tests') {
      const repoId = url.searchParams.get('repoId');
      const filtered = unitTestRuns.filter((r) => r.repoId === repoId);
      send(res, 200, { data: filtered, total: filtered.length, page: 1, pageSize: 25 });
      return;
    }

    const runCancelMatch = pathname.match(/^\/unit-tests\/([^/]+)\/cancel$/);
    if (method === 'POST' && runCancelMatch) {
      const run = unitTestRuns.find((r) => r.id === runCancelMatch[1]);
      if (!run) {
        send(res, 404, { message: 'not found' });
        return;
      }
      run.status = 'cancelled';
      send(res, 201, run);
      return;
    }

    const runResultsMatch = pathname.match(/^\/unit-tests\/([^/]+)\/results$/);
    if (method === 'GET' && runResultsMatch) {
      send(res, 200, resultsByRun.get(runResultsMatch[1]!) ?? []);
      return;
    }

    const runFilesMatch = pathname.match(/^\/unit-tests\/([^/]+)\/generated-files$/);
    if (method === 'GET' && runFilesMatch) {
      send(res, 200, generatedFilesByRun.get(runFilesMatch[1]!) ?? []);
      return;
    }

    const runMatch = pathname.match(/^\/unit-tests\/([^/]+)$/);
    if (method === 'GET' && runMatch) {
      sendOrNotFound(
        res,
        unitTestRuns.find((r) => r.id === runMatch[1]),
      );
      return;
    }

    const unitTestReportsListMatch = pathname.match(/^\/unit-tests\/([^/]+)\/reports$/);
    if (method === 'GET' && unitTestReportsListMatch) {
      send(res, 200, unitTestReportsByRun.get(unitTestReportsListMatch[1]!) ?? []);
      return;
    }
    if (method === 'POST' && unitTestReportsListMatch) {
      const runId = unitTestReportsListMatch[1]!;
      const { format } = await readJsonBody(req);
      const report: UnitTestReport = {
        id: id('unit-test-report'),
        orgId: 'org_1',
        unitTestRunId: runId,
        format: format ?? 'json',
        storageKey: `k/${runId}/${format}`,
        createdAt: new Date().toISOString(),
      };
      const list = unitTestReportsByRun.get(runId) ?? [];
      unitTestReportsByRun.set(runId, [...list.filter((r) => r.format !== report.format), report]);
      unitTestReportContent.set(
        report.id,
        JSON.stringify({
          results: resultsByRun.get(runId) ?? [],
          generatedFiles: generatedFilesByRun.get(runId) ?? [],
        }),
      );
      send(res, 201, report);
      return;
    }

    const unitTestReportContentMatch = pathname.match(/^\/unit-test-reports\/([^/]+)\/content$/);
    if (method === 'GET' && unitTestReportContentMatch) {
      const body = unitTestReportContent.get(unitTestReportContentMatch[1]!);
      if (body === undefined) {
        send(res, 404, { message: 'not found' });
        return;
      }
      send(res, 200, body, 'application/json');
      return;
    }

    if (method === 'POST' && pathname === '/coverage-runs') {
      const input = (await readJsonBody(req)) as unknown as { repoId: string; baseRef?: string };
      const repo = repos.find((r) => r.id === input.repoId);
      const run: CoverageRun = {
        id: id('coverage-run'),
        orgId: 'org_1',
        repoId: input.repoId ?? '',
        baseRef: input.baseRef ?? repo?.defaultBranch ?? 'main',
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      coverageRuns.push(run);
      send(res, 201, run);
      return;
    }

    if (method === 'GET' && pathname === '/coverage-runs') {
      const repoId = url.searchParams.get('repoId');
      const filtered = coverageRuns.filter((r) => r.repoId === repoId);
      send(res, 200, { data: filtered, total: filtered.length, page: 1, pageSize: 25 });
      return;
    }

    const coverageCancelMatch = pathname.match(/^\/coverage-runs\/([^/]+)\/cancel$/);
    if (method === 'POST' && coverageCancelMatch) {
      const run = coverageRuns.find((r) => r.id === coverageCancelMatch[1]);
      if (!run) {
        send(res, 404, { message: 'not found' });
        return;
      }
      run.status = 'cancelled';
      send(res, 201, run);
      return;
    }

    const coverageResultsMatch = pathname.match(/^\/coverage-runs\/([^/]+)\/results$/);
    if (method === 'GET' && coverageResultsMatch) {
      send(res, 200, coverageFileResultsByRun.get(coverageResultsMatch[1]!) ?? []);
      return;
    }

    const coverageReportsListMatch = pathname.match(/^\/coverage-runs\/([^/]+)\/reports$/);
    if (method === 'GET' && coverageReportsListMatch) {
      send(res, 200, coverageReportsByRun.get(coverageReportsListMatch[1]!) ?? []);
      return;
    }
    if (method === 'POST' && coverageReportsListMatch) {
      const runId = coverageReportsListMatch[1]!;
      const { format } = await readJsonBody(req);
      const report: CoverageReport = {
        id: id('coverage-report'),
        orgId: 'org_1',
        coverageRunId: runId,
        format: format ?? 'json',
        storageKey: `k/${runId}/${format}`,
        createdAt: new Date().toISOString(),
      };
      const list = coverageReportsByRun.get(runId) ?? [];
      coverageReportsByRun.set(runId, [...list.filter((r) => r.format !== report.format), report]);
      coverageReportContent.set(
        report.id,
        JSON.stringify({ fileResults: coverageFileResultsByRun.get(runId) ?? [] }),
      );
      send(res, 201, report);
      return;
    }

    const coverageReportContentMatch = pathname.match(/^\/coverage-reports\/([^/]+)\/content$/);
    if (method === 'GET' && coverageReportContentMatch) {
      const body = coverageReportContent.get(coverageReportContentMatch[1]!);
      if (body === undefined) {
        send(res, 404, { message: 'not found' });
        return;
      }
      send(res, 200, body, 'application/json');
      return;
    }

    // Must come after the more specific /coverage-runs/:id/... routes above.
    const coverageRunMatch = pathname.match(/^\/coverage-runs\/([^/]+)$/);
    if (method === 'GET' && coverageRunMatch) {
      sendOrNotFound(
        res,
        coverageRuns.find((r) => r.id === coverageRunMatch[1]),
      );
      return;
    }

    if (method === 'GET' && pathname === '/crons') {
      send(res, 200, { crons: cronDefinitions, environments: ['dev', 'staging'] });
      return;
    }

    if (method === 'POST' && pathname === '/cron-runs') {
      const input = (await readJsonBody(req)) as Record<string, unknown>;
      const definition = cronDefinitions.find((c) => c.id === input.cronId);
      if (!definition) {
        send(res, 404, { message: `Cron not found: ${input.cronId}` });
        return;
      }
      const run: CronRunFixture = {
        id: id('cronrun'),
        orgId: 'org_1',
        cronId: definition.id,
        cronName: definition.name,
        environment: (input.environment as string) ?? 'dev',
        status: 'succeeded',
        statusCode: 200,
        responseBody: JSON.stringify({ status: 200, message: 'ok', data: { jobsProcessed: 1 } }),
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      cronRuns.unshift(run);
      send(res, 201, run);
      return;
    }

    if (method === 'GET' && pathname === '/cron-runs') {
      send(res, 200, { data: cronRuns, total: cronRuns.length, page: 1, pageSize: 25 });
      return;
    }

    if (method === 'GET' && pathname === '/qa-automation/schedule') {
      send(res, 200, qaAutomationSchedule);
      return;
    }

    if (method === 'PUT' && pathname === '/qa-automation/schedule') {
      const input = (await readJsonBody(req)) as unknown as {
        intervalHours?: number;
        enabled?: boolean;
      };
      if (input.intervalHours !== undefined)
        qaAutomationSchedule.intervalHours = input.intervalHours;
      if (input.enabled !== undefined) qaAutomationSchedule.enabled = input.enabled;
      send(res, 200, qaAutomationSchedule);
      return;
    }

    if (
      method === 'POST' &&
      (pathname === '/qa-automation/runs' || pathname === '/qa-automation/staging/runs')
    ) {
      const environment = pathname === '/qa-automation/staging/runs' ? 'staging' : 'production';
      const run: QaAutomationRunFixture = {
        id: id('qarun'),
        orgId: 'org_1',
        environment,
        status: 'completed',
        triggeredBy: 'manual',
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      qaAutomationRuns.unshift(run);
      qaAutomationResultsByRun.set(run.id, [
        {
          id: id('qaresult'),
          runId: run.id,
          testId: 'slot-listing-pricing',
          testName: 'Slot listing pricing matches Sunday/weekday business rule',
          passed: true,
          details: 'ok',
          createdAt: new Date().toISOString(),
          // Only a staging result ever carries this — production has only ever had one source.
          ...(environment === 'staging'
            ? { sourceUrl: 'https://github.com/codewithVsingh/curatal_tests/tree/main/tests' }
            : {}),
        },
      ]);
      send(res, 201, { status: 'queued' });
      return;
    }

    if (method === 'GET' && pathname === '/qa-automation/runs') {
      const environment = url.searchParams.get('environment') ?? 'production';
      const filtered = qaAutomationRuns.filter((r) => r.environment === environment);
      send(res, 200, { data: filtered, total: filtered.length, page: 1, pageSize: 25 });
      return;
    }

    if (method === 'GET' && pathname === '/qa-automation/staging/schedule') {
      send(res, 200, qaAutomationStagingSchedule);
      return;
    }

    if (method === 'PUT' && pathname === '/qa-automation/staging/schedule') {
      const input = (await readJsonBody(req)) as unknown as { enabled?: boolean };
      if (input.enabled !== undefined) qaAutomationStagingSchedule.enabled = input.enabled;
      send(res, 200, qaAutomationStagingSchedule);
      return;
    }

    const qaRunMatch = pathname.match(/^\/qa-automation\/runs\/([^/]+)$/);
    if (method === 'GET' && qaRunMatch) {
      const run = qaAutomationRuns.find((r) => r.id === qaRunMatch[1]);
      if (!run) {
        send(res, 404, { message: `QaAutomationRun not found: ${qaRunMatch[1]}` });
        return;
      }
      send(res, 200, { ...run, results: qaAutomationResultsByRun.get(run.id) ?? [] });
      return;
    }

    const qaReportsListMatch = pathname.match(/^\/qa-automation\/runs\/([^/]+)\/reports$/);
    if (method === 'GET' && qaReportsListMatch) {
      send(res, 200, qaAutomationReportsByRun.get(qaReportsListMatch[1]!) ?? []);
      return;
    }
    if (method === 'POST' && qaReportsListMatch) {
      const runId = qaReportsListMatch[1]!;
      const { format } = (await readJsonBody(req)) as { format?: string };
      const report: QaAutomationReportFixture = {
        id: id('qa-automation-report'),
        orgId: 'org_1',
        runId,
        format: format ?? 'pdf',
        storageKey: `k/${runId}/${format}`,
        createdAt: new Date().toISOString(),
      };
      const list = qaAutomationReportsByRun.get(runId) ?? [];
      qaAutomationReportsByRun.set(runId, [
        ...list.filter((r) => r.format !== report.format),
        report,
      ]);
      qaAutomationReportContent.set(report.id, Buffer.from('%PDF-1.4 fake report content'));
      send(res, 201, report);
      return;
    }

    const qaReportContentMatch = pathname.match(/^\/qa-automation-reports\/([^/]+)\/content$/);
    if (method === 'GET' && qaReportContentMatch) {
      const body = qaAutomationReportContent.get(qaReportContentMatch[1]!);
      if (body === undefined) {
        send(res, 404, { message: 'not found' });
        return;
      }
      send(res, 200, body, 'application/pdf');
      return;
    }

    send(res, 404, { message: `no route for ${method} ${pathname}` });
  }

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      send(res, 500, { message: error instanceof Error ? error.message : 'unknown error' });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    repos,
    scans,
    findingsByScan,
    summaryByScan,
    reportsByScan,
    directories,
    unitTestRuns,
    receivedUnitTestCreateBodies,
    resultsByRun,
    generatedFilesByRun,
    unitTestReportsByRun,
    coverageRuns,
    coverageFileResultsByRun,
    coverageReportsByRun,
    cronDefinitions,
    cronRuns,
    qaAutomationSchedule,
    qaAutomationStagingSchedule,
    qaAutomationRuns,
    qaAutomationResultsByRun,
    qaAutomationReportsByRun,
    mockUsers,
    authTokens,
  };
}
