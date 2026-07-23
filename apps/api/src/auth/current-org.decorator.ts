import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './api-token.guard.js';

/**
 * The only way a controller learns orgId — never a request body/query
 * param (see docs/adr/0014-auth-model.md, closing the gap ADR-0010/Phase 5
 * flagged explicitly).
 */
export const CurrentOrg = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
  if (!request.auth) {
    throw new Error('CurrentOrg used on a route without ApiTokenGuard — this is a bug, not a 401');
  }
  return request.auth.orgId;
});
