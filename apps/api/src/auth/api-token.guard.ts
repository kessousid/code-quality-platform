import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ValidateApiTokenUseCase } from '@cqp/application';
import type { ApiTokenRepository } from '@cqp/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { API_TOKEN_REPOSITORY } from '../tokens.js';

export interface AuthContext {
  orgId: string;
  tokenId: string;
}

const SESSION_COOKIE_NAME = 'cqp_session';

/**
 * Applied globally (main.ts / APP_GUARD) so every new controller is
 * protected by default — opting out (@Public()) is the exception, not
 * something every new route has to remember. See docs/adr/0014-auth-model.md.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly validateApiToken: ValidateApiTokenUseCase;

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_TOKEN_REPOSITORY) apiTokenRepository: ApiTokenRepository,
  ) {
    this.validateApiToken = new ValidateApiTokenUseCase(apiTokenRepository);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const rawToken = this.extractToken(request);
    if (!rawToken) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const result = await this.validateApiToken.execute(rawToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or revoked token');
    }

    request.auth = { orgId: result.orgId, tokenId: result.tokenId };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[SESSION_COOKIE_NAME];
  }
}

export { SESSION_COOKIE_NAME };
