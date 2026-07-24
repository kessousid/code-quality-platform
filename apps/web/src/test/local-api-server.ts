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
  resultsByRun: Map<string, unknown[]>;
  generatedFilesByRun: Map<string, unknown[]>;
  unitTestReportsByRun: Map<string, unknown[]>;
  coverageRuns: CoverageRun[];
  coverageFileResultsByRun: Map<string, unknown[]>;
  coverageReportsByRun: Map<string, unknown[]>;
}

interface Report {
  id: string;
  orgId: string;
  scanId: string;
  format: string;
  storageKey: string;
  createdAt: string;
}

interface UnitTestReport {
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
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
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
  const resultsByRun = new Map<string, unknown[]>();
  const generatedFilesByRun = new Map<string, unknown[]>();
  const unitTestReportsByRun = new Map<string, UnitTestReport[]>();
  const unitTestReportContent = new Map<string, string>();
  const coverageRuns: CoverageRun[] = [];
  const coverageFileResultsByRun = new Map<string, unknown[]>();
  const coverageReportsByRun = new Map<string, CoverageReport[]>();
  const coverageReportContent = new Map<string, string>();

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { method } = req;
    const { pathname } = url;

    if (method === 'POST' && pathname === '/auth/session') {
      res.writeHead(201, { 'Set-Cookie': 'cqp_session=x; HttpOnly' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && pathname === '/auth/login') {
      const { email } = await readJsonBody(req);
      if (!email?.endsWith('@curatal.com')) {
        send(res, 401, { message: 'Only @curatal.com email addresses are allowed' });
        return;
      }
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
      };
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
    resultsByRun,
    generatedFilesByRun,
    unitTestReportsByRun,
    coverageRuns,
    coverageFileResultsByRun,
    coverageReportsByRun,
  };
}
