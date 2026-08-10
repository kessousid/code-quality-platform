import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashApiToken } from '@cqp/application';
import {
  InMemoryApiTokenRepository,
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryOrgRepository,
  InMemoryScanQueueRegistry,
  InMemoryUserRepository,
} from '@cqp/application/testing';
import { AppModule } from './app.module.js';
import {
  API_TOKEN_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  EMAIL_SENDER,
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
  let emailSender: InMemoryEmailSender;
  const rawToken = 'cqp_e2e_test_token';

  const originalWebBaseUrl = process.env.WEB_BASE_URL;
  const originalRepoTokenEncryptionKey = process.env.REPO_TOKEN_ENCRYPTION_KEY;

  beforeAll(async () => {
    // Read directly by AuthController's constructor (docs/adr/0041) — real
    // Postgres/Redis are already avoided below via provider overrides, this
    // is the same idea for the one plain env var that isn't a DI token.
    process.env.WEB_BASE_URL = 'https://e2e.example.com';
    // Read directly by RepoModule's provider factories (docs/adr/0047) — same reasoning.
    process.env.REPO_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

    tokenRepository = new InMemoryApiTokenRepository();
    await tokenRepository.create({
      orgId: 'org_1',
      name: 'e2e',
      tokenHash: hashApiToken(rawToken),
    });
    emailSender = new InMemoryEmailSender();

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
      .overrideProvider(AUTH_TOKEN_REPOSITORY)
      .useValue(new InMemoryAuthTokenRepository())
      // Avoids requiring real ALERT_EMAIL_FROM/APP_PASSWORD env vars at boot.
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalWebBaseUrl === undefined) {
      delete process.env.WEB_BASE_URL;
    } else {
      process.env.WEB_BASE_URL = originalWebBaseUrl;
    }
    if (originalRepoTokenEncryptionKey === undefined) {
      delete process.env.REPO_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.REPO_TOKEN_ENCRYPTION_KEY = originalRepoTokenEncryptionKey;
    }
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

  it('POST /auth/signup and /auth/login both reject any domain other than curatal.com (docs/adr/0041)', async () => {
    const signupRejected = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'someone@gmail.com', password: 'a-real-password' });
    expect(signupRejected.status).toBe(401);

    const loginRejected = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'someone@gmail.com', password: 'whatever' });
    expect(loginRejected.status).toBe(401);
  });

  it('the full signup -> verify-email -> login journey works over real HTTP (docs/adr/0041)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'e2e-signup@curatal.com', password: 'a-real-password' });
    expect(signup.status).toBe(201);

    // Not verified yet — login is refused.
    const tooEarly = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e-signup@curatal.com', password: 'a-real-password' });
    expect(tooEarly.status).toBe(401);

    const verifyToken = new URL(
      emailSender.sent.at(-1)!.body.match(/https:\S+/)![0],
    ).searchParams.get('token')!;
    const verify = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: verifyToken });
    expect(verify.status).toBe(201);
    expect(String(verify.headers['set-cookie'])).toContain('HttpOnly');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e-signup@curatal.com', password: 'a-real-password' });
    expect(login.status).toBe(201);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
  });

  it('rejects a malformed POST /scans body with a 400 before it ever reaches a use case', async () => {
    const res = await request(app.getHttpServer())
      .post('/scans')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ mode: 'not-a-real-mode' });

    expect(res.status).toBe(400);
  });
});
