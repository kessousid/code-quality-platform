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
  InMemoryOrgRepository,
  InMemoryScanQueueRegistry,
  InMemoryUserRepository,
} from '@cqp/application/testing';
import { AppModule } from './app.module.js';
import {
  API_TOKEN_REPOSITORY,
  ORG_REPOSITORY,
  SCAN_QUEUE_REGISTRY,
  USER_REPOSITORY,
} from './tokens.js';

/**
 * Boots the *real* AppModule — the actual global ApiTokenGuard (APP_GUARD),
 * the actual @Public() wiring, the actual ValidationPipe — over real HTTP
 * via supertest. Only API_TOKEN_REPOSITORY is swapped for an in-memory
 * fake, so this never touches Prisma/Postgres. Everything downstream of
 * the auth layer (repos, scans, findings) still depends on Prisma and will
 * fail past the guard — that's the same documented sandbox gap as
 * Phases 3–5, not something this test hides.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let tokenRepository: InMemoryApiTokenRepository;
  const rawToken = 'cqp_e2e_test_token';

  beforeAll(async () => {
    tokenRepository = new InMemoryApiTokenRepository();
    await tokenRepository.create({
      orgId: 'org_1',
      name: 'e2e',
      tokenHash: hashApiToken(rawToken),
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_TOKEN_REPOSITORY)
      .useValue(tokenRepository)
      // Avoids a real Redis connection attempt at boot (docs/adr/0021) —
      // same reasoning as overriding API_TOKEN_REPOSITORY above.
      .overrideProvider(SCAN_QUEUE_REGISTRY)
      .useValue(new InMemoryScanQueueRegistry())
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

  it('GET /health succeeds without any auth (proves @Public() + global guard coexist)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects a protected route with no token', async () => {
    const res = await request(app.getHttpServer()).get('/repos');
    expect(res.status).toBe(401);
  });

  it('rejects a protected route with a garbage bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/repos')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('lets a valid bearer token past the guard (does not 401)', async () => {
    const res = await request(app.getHttpServer())
      .get('/repos')
      .set('Authorization', `Bearer ${rawToken}`);
    // Past the guard, the request hits PrismaRepoRepository with no live
    // Postgres — a 500 here is the expected, documented sandbox gap. What
    // this test actually verifies is that auth itself did not block it.
    expect(res.status).not.toBe(401);
  });

  it('POST /auth/session sets an httpOnly cookie for a valid token, rejects an invalid one', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/auth/session')
      .send({ token: 'not-a-real-token' });
    expect(invalid.status).toBe(401);

    const valid = await request(app.getHttpServer())
      .post('/auth/session')
      .send({ token: rawToken });
    expect(valid.status).toBe(201);
    const setCookie = valid.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('HttpOnly');
  });

  it('POST /auth/login accepts a curatal.com email and rejects any other domain (ADR-0022)', async () => {
    const rejected = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'someone@gmail.com' });
    expect(rejected.status).toBe(401);

    const accepted = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e-login@curatal.com' });
    expect(accepted.status).toBe(201);
    const setCookie = accepted.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('HttpOnly');
  });

  it('rejects a malformed POST /scans body with a 400 before it ever reaches a use case', async () => {
    const res = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ mode: 'not-a-real-mode' });

    expect(res.status).toBe(400);
  });
});
