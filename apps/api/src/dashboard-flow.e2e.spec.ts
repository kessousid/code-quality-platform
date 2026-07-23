import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashApiToken } from '@cqp/application';
import {
  InMemoryApiTokenRepository,
  InMemoryFindingRepository,
  InMemoryObjectStorage,
  InMemoryOrgRepository,
  InMemoryRepoRepository,
  InMemoryReportRepository,
  InMemoryScanQueue,
  InMemoryScanRepository,
  InMemoryUserRepository,
} from '@cqp/application/testing';
import { AppModule } from './app.module.js';
import {
  API_TOKEN_REPOSITORY,
  FINDING_REPOSITORY,
  OBJECT_STORAGE,
  ORG_REPOSITORY,
  REPO_REPOSITORY,
  REPORT_REPOSITORY,
  SCAN_QUEUE,
  SCAN_REPOSITORY,
  USER_REPOSITORY,
} from './tokens.js';

/**
 * Every other apps/api spec either bypasses HTTP (constructs a controller
 * directly) or hits real Prisma and expects a 500 (the documented sandbox
 * gap). This one boots the *actual* AppModule — every module's real
 * `imports`/`exports` wiring, the real global guard, the real controllers —
 * over real HTTP, with every repository port swapped for its in-memory
 * double so it runs without Postgres. It exists specifically to prove the
 * cross-module DI graph changes from Phase 10 (ScanModule now importing
 * FindingModule, ReportModule importing both) actually resolve, which a
 * per-controller unit test with hand-wired use cases can't catch — and to
 * prove the exact contract the Phase 10 frontend depends on end to end:
 * create repo -> create scan -> read findings/summary -> generate a report
 * -> download its real bytes.
 */
describe('Dashboard flow (e2e, in-memory repositories)', () => {
  let app: INestApplication;
  const rawToken = 'cqp_dashboard_flow_token';
  const findingRepository = new InMemoryFindingRepository();

  beforeAll(async () => {
    const tokenRepository = new InMemoryApiTokenRepository();
    await tokenRepository.create({
      orgId: 'org_1',
      name: 'e2e',
      tokenHash: hashApiToken(rawToken),
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_TOKEN_REPOSITORY)
      .useValue(tokenRepository)
      .overrideProvider(REPO_REPOSITORY)
      .useValue(new InMemoryRepoRepository())
      .overrideProvider(SCAN_REPOSITORY)
      .useValue(new InMemoryScanRepository())
      .overrideProvider(FINDING_REPOSITORY)
      .useValue(findingRepository)
      .overrideProvider(REPORT_REPOSITORY)
      .useValue(new InMemoryReportRepository())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(new InMemoryObjectStorage())
      .overrideProvider(SCAN_QUEUE)
      .useValue(new InMemoryScanQueue())
      .overrideProvider(ORG_REPOSITORY)
      .useValue(new InMemoryOrgRepository())
      .overrideProvider(USER_REPOSITORY)
      .useValue(new InMemoryUserRepository())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks the full repo -> scan -> findings -> summary -> report flow over real HTTP', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${rawToken}` };

    const repoRes = await request(server)
      .post('/repos')
      .set(auth)
      .send({ name: 'dashboard-e2e-repo' });
    expect(repoRes.status).toBe(201);
    const repoId = repoRes.body.id;

    const scanRes = await request(server)
      .post('/scans')
      .set(auth)
      .send({ repoId, ref: 'main', mode: 'full' });
    expect(scanRes.status).toBe(201);
    const scanId = scanRes.body.id;

    // No HTTP endpoint creates findings (they come from the scan engine /
    // worker, not yet wired to the API) — seed directly, exactly as a real
    // scan run would leave behind via PrismaFindingRepository.
    findingRepository.seed({
      id: 'finding_1',
      scanId,
      orgId: 'org_1',
      repoId,
      category: 'security',
      source: 'semgrep',
      ruleId: 'eval-detected',
      title: 'Use of eval() with untrusted input',
      severity: 'critical',
      confidence: 'high',
      locations: [{ filePath: 'src/vuln.js', startLine: 6 }],
      rootCause: 'x',
      riskDescription: 'y',
      recommendedFix: 'z',
      references: [],
      patchPrConfirmedByUser: false,
      firstSeenScanId: scanId,
      lastSeenScanId: scanId,
      status: 'open',
    });

    const listScansRes = await request(server).get('/scans').query({ repoId }).set(auth);
    expect(listScansRes.status).toBe(200);
    expect(listScansRes.body.data.map((s: { id: string }) => s.id)).toEqual([scanId]);

    const findingsRes = await request(server).get(`/scans/${scanId}/findings`).set(auth);
    expect(findingsRes.status).toBe(200);
    expect(findingsRes.body).toHaveLength(1);

    const summaryRes = await request(server).get(`/scans/${scanId}/summary`).set(auth);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.healthScore).toBe(75); // 100 - critical(25)
    expect(summaryRes.body.totalFindings).toBe(1);

    const generateRes = await request(server)
      .post(`/scans/${scanId}/reports`)
      .set(auth)
      .send({ format: 'json' });
    expect(generateRes.status).toBe(201);
    const reportId = generateRes.body.id;

    const contentRes = await request(server).get(`/reports/${reportId}/content`).set(auth);
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['content-type']).toContain('application/json');
    const parsed = JSON.parse(contentRes.text);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary.healthScore).toBe(75);
  });

  it('rejects the whole flow without a valid token, at the very first step', async () => {
    const res = await request(app.getHttpServer()).post('/repos').send({ name: 'x' });
    expect(res.status).toBe(401);
  });
});
