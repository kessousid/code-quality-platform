import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { InMemoryApiTokenRepository } from '@cqp/application/testing';
import { ApiTokenGuard } from './api-token.guard.js';

function makeContext(request: Record<string, unknown>, handlerMeta = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handlerMeta,
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ApiTokenGuard', () => {
  it('rejects a request with no token at all', async () => {
    const guard = new ApiTokenGuard(new Reflector(), new InMemoryApiTokenRepository());
    const context = makeContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown bearer token', async () => {
    const guard = new ApiTokenGuard(new Reflector(), new InMemoryApiTokenRepository());
    const context = makeContext({ headers: { authorization: 'Bearer not-a-real-token' } });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid bearer token and attaches orgId to the request', async () => {
    const repository = new InMemoryApiTokenRepository();
    const { hashApiToken } = await import('@cqp/application');
    const rawToken = 'cqp_test_token';
    await repository.create({ orgId: 'org_1', name: 'test', tokenHash: hashApiToken(rawToken) });

    const guard = new ApiTokenGuard(new Reflector(), repository);
    const request: { headers: Record<string, string>; auth?: { orgId: string } } = {
      headers: { authorization: `Bearer ${rawToken}` },
    };

    const allowed = await guard.canActivate(makeContext(request));

    expect(allowed).toBe(true);
    expect(request.auth?.orgId).toBe('org_1');
  });

  it('rejects a revoked token', async () => {
    const repository = new InMemoryApiTokenRepository();
    const { hashApiToken } = await import('@cqp/application');
    const rawToken = 'cqp_test_token';
    const { id } = await repository.create({
      orgId: 'org_1',
      name: 'test',
      tokenHash: hashApiToken(rawToken),
    });
    repository.revoke(id);

    const guard = new ApiTokenGuard(new Reflector(), repository);
    const context = makeContext({ headers: { authorization: `Bearer ${rawToken}` } });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('reads the token from the session cookie when no Authorization header is present', async () => {
    const repository = new InMemoryApiTokenRepository();
    const { hashApiToken } = await import('@cqp/application');
    const rawToken = 'cqp_test_token';
    await repository.create({ orgId: 'org_1', name: 'test', tokenHash: hashApiToken(rawToken) });

    const guard = new ApiTokenGuard(new Reflector(), repository);
    const request = { headers: {}, cookies: { cqp_session: rawToken } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('lets a route marked @Public() through without a token', async () => {
    const reflector = new Reflector();
    const guard = new ApiTokenGuard(reflector, new InMemoryApiTokenRepository());

    // Simulate getAllAndOverride returning true, as it would for a @Public() handler.
    reflector.getAllAndOverride = () => true;

    await expect(guard.canActivate(makeContext({ headers: {} }))).resolves.toBe(true);
  });
});
