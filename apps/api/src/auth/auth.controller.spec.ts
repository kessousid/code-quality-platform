import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { hashApiToken } from '@cqp/application';
import {
  InMemoryApiTokenRepository,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from '@cqp/application/testing';
import { AuthController } from './auth.controller.js';
import { API_TOKEN_REPOSITORY, ORG_REPOSITORY, USER_REPOSITORY } from '../tokens.js';

/** Same vertical-slice pattern as every other controller spec — real DI, no Prisma. */
async function buildTestingModule() {
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const orgRepository = new InMemoryOrgRepository();
  const userRepository = new InMemoryUserRepository();
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
    ],
  }).compile();

  return { controller: moduleRef.get(AuthController), orgRepository, userRepository, rawToken };
}

function fakeResponse() {
  const cookies: Record<string, unknown> = {};
  const res = {
    cookie: (name: string, value: string) => (cookies[name] = value),
  } as unknown as Response;
  return { res, cookies };
}

describe('AuthController', () => {
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

  it('POST /login accepts a curatal.com email, provisions the shared org, and sets a session cookie', async () => {
    const { controller, orgRepository, userRepository } = await buildTestingModule();
    const { res, cookies } = fakeResponse();

    const result = await controller.login({ email: 'newperson@curatal.com' }, res);

    expect(result.status).toBe('ok');
    expect(typeof cookies.cqp_session).toBe('string');
    expect(String(cookies.cqp_session).length).toBeGreaterThan(0);

    const org = await orgRepository.findBySlug('curatal');
    expect(org).not.toBeNull();
    const user = await userRepository.findByEmail('newperson@curatal.com');
    expect(user?.orgId).toBe(org?.id);
  });

  it('POST /login rejects a non-curatal.com email with 401, not 500', async () => {
    const { controller } = await buildTestingModule();
    const { res } = fakeResponse();

    await expect(controller.login({ email: 'someone@gmail.com' }, res)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('POST /login called twice with the same email sets a different cookie value each time', async () => {
    const { controller } = await buildTestingModule();
    const first = fakeResponse();
    const second = fakeResponse();

    await controller.login({ email: 'repeat@curatal.com' }, first.res);
    await controller.login({ email: 'repeat@curatal.com' }, second.res);

    expect(first.cookies.cqp_session).not.toBe(second.cookies.cqp_session);
  });
});
