import 'reflect-metadata';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { hashApiToken } from '@cqp/application';
import {
  InMemoryApiTokenRepository,
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from '@cqp/application/testing';
import { AuthController } from './auth.controller.js';
import {
  API_TOKEN_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  EMAIL_SENDER,
  ORG_REPOSITORY,
  USER_REPOSITORY,
} from '../tokens.js';

const WEB_BASE_URL = 'https://app.example.com';

/** Same vertical-slice pattern as every other controller spec — real DI, no Prisma. */
async function buildTestingModule() {
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const orgRepository = new InMemoryOrgRepository();
  const userRepository = new InMemoryUserRepository();
  const authTokenRepository = new InMemoryAuthTokenRepository();
  const emailSender = new InMemoryEmailSender();
  const rawToken = 'cqp_real_token';
  await apiTokenRepository.create({
    orgId: 'org_1',
    name: 'ci',
    tokenHash: hashApiToken(rawToken),
  });

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: API_TOKEN_REPOSITORY, useValue: apiTokenRepository },
      { provide: ORG_REPOSITORY, useValue: orgRepository },
      { provide: USER_REPOSITORY, useValue: userRepository },
      { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepository },
      { provide: EMAIL_SENDER, useValue: emailSender },
    ],
  }).compile();

  return {
    controller: moduleRef.get(AuthController),
    orgRepository,
    userRepository,
    authTokenRepository,
    emailSender,
    rawToken,
  };
}

function fakeResponse() {
  const cookies: Record<string, unknown> = {};
  const res = {
    cookie: (name: string, value: string) => (cookies[name] = value),
  } as unknown as Response;
  return { res, cookies };
}

function extractTokenFromEmail(body: string): string {
  return new URL(body.match(/https:\S+/)![0]).searchParams.get('token')!;
}

describe('AuthController', () => {
  const originalWebBaseUrl = process.env.WEB_BASE_URL;

  beforeEach(() => {
    process.env.WEB_BASE_URL = WEB_BASE_URL;
  });

  afterEach(() => {
    if (originalWebBaseUrl === undefined) {
      delete process.env.WEB_BASE_URL;
    } else {
      process.env.WEB_BASE_URL = originalWebBaseUrl;
    }
  });

  it('POST /session accepts a real API token and sets the session cookie', async () => {
    const { controller, rawToken } = await buildTestingModule();
    const { res, cookies } = fakeResponse();

    const result = await controller.createSession({ token: rawToken }, res);

    expect(result.status).toBe('ok');
    expect(cookies.cqp_session).toBe(rawToken);
  });

  it('POST /session rejects an invalid token', async () => {
    const { controller } = await buildTestingModule();
    const { res } = fakeResponse();

    await expect(controller.createSession({ token: 'garbage' }, res)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('POST /signup rejects a non-curatal.com email with 401', async () => {
    const { controller } = await buildTestingModule();
    await expect(
      controller.signupRoute({ email: 'someone@gmail.com', password: 'a-real-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('POST /signup rejects a too-short password with 400', async () => {
    const { controller } = await buildTestingModule();
    await expect(
      controller.signupRoute({ email: 'new@curatal.com', password: 'short' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('POST /signup rejects an already-registered email with 409', async () => {
    const { controller } = await buildTestingModule();
    await controller.signupRoute({ email: 'taken@curatal.com', password: 'a-real-password' });
    await expect(
      controller.signupRoute({ email: 'taken@curatal.com', password: 'a-different-password' }),
    ).rejects.toThrow(ConflictException);
  });

  it('the full signup -> verify -> login journey works end to end', async () => {
    const { controller, orgRepository, userRepository, emailSender } = await buildTestingModule();

    const signupResult = await controller.signupRoute({
      email: 'newperson@curatal.com',
      password: 'a-real-password',
    });
    expect(signupResult.status).toBe('ok');

    // Not logged in yet — pending_verification is refused.
    const preVerifyLogin = fakeResponse();
    await expect(
      controller.loginRoute(
        { email: 'newperson@curatal.com', password: 'a-real-password' },
        preVerifyLogin.res,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(emailSender.sent).toHaveLength(1);
    const verifyToken = extractTokenFromEmail(emailSender.sent[0]!.body);
    const { res: verifyRes, cookies: verifyCookies } = fakeResponse();
    const verifyResult = await controller.verifyEmailRoute({ token: verifyToken }, verifyRes);
    expect(verifyResult.status).toBe('ok');
    expect(typeof verifyCookies.cqp_session).toBe('string');

    const org = await orgRepository.findBySlug('curatal');
    const user = await userRepository.findByEmail('newperson@curatal.com');
    expect(user?.orgId).toBe(org?.id);
    expect(user?.status).toBe('active');

    // Now login works.
    const { res: loginRes, cookies: loginCookies } = fakeResponse();
    const loginResult = await controller.loginRoute(
      { email: 'newperson@curatal.com', password: 'a-real-password' },
      loginRes,
    );
    expect(loginResult.status).toBe('ok');
    expect(loginCookies.cqp_session).not.toBe(verifyCookies.cqp_session);
  });

  it('POST /login rejects a non-curatal.com email with 401, not 500', async () => {
    const { controller } = await buildTestingModule();
    const { res } = fakeResponse();

    await expect(
      controller.loginRoute({ email: 'someone@gmail.com', password: 'whatever' }, res),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('POST /login rejects the wrong password with a generic 401', async () => {
    const { controller } = await buildTestingModule();
    await controller.signupRoute({ email: 'real@curatal.com', password: 'the-real-password' });

    await expect(
      controller.loginRoute({ email: 'real@curatal.com', password: 'wrong' }, fakeResponse().res),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('POST /forgot-password always returns ok, whether or not the email has an account (anti-enumeration)', async () => {
    const { controller, emailSender } = await buildTestingModule();

    const result = await controller.forgotPasswordRoute({ email: 'nobody@curatal.com' });

    expect(result.status).toBe('ok');
    expect(emailSender.sent).toHaveLength(0);
  });

  it('the full forgot-password -> reset -> login journey works end to end', async () => {
    const { controller, emailSender } = await buildTestingModule();
    await controller.signupRoute({ email: 'real@curatal.com', password: 'the-old-password' });
    emailSender.sent.length = 0; // drop the signup verification email, only care about the reset one below

    await controller.forgotPasswordRoute({ email: 'real@curatal.com' });
    expect(emailSender.sent).toHaveLength(1);
    const resetToken = extractTokenFromEmail(emailSender.sent[0]!.body);

    const { res, cookies } = fakeResponse();
    const resetResult = await controller.resetPasswordRoute(
      { token: resetToken, password: 'the-new-password' },
      res,
    );
    expect(resetResult.status).toBe('ok');
    expect(typeof cookies.cqp_session).toBe('string');

    // Old password no longer works, new one does (and this also verified the account, so login succeeds).
    await expect(
      controller.loginRoute(
        { email: 'real@curatal.com', password: 'the-old-password' },
        fakeResponse().res,
      ),
    ).rejects.toThrow(UnauthorizedException);
    const finalLogin = await controller.loginRoute(
      { email: 'real@curatal.com', password: 'the-new-password' },
      fakeResponse().res,
    );
    expect(finalLogin.status).toBe('ok');
  });

  it('POST /reset-password rejects an unknown or already-used token', async () => {
    const { controller } = await buildTestingModule();
    await expect(
      controller.resetPasswordRoute(
        { token: 'garbage', password: 'a-real-password' },
        fakeResponse().res,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
