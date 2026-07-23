import { Body, Controller, Inject, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  InvalidEmailDomainError,
  LoginWithEmailUseCase,
  ValidateApiTokenUseCase,
} from '@cqp/application';
import type { ApiTokenRepository, OrgRepository, UserRepository } from '@cqp/core';
import { API_TOKEN_REPOSITORY, ORG_REPOSITORY, USER_REPOSITORY } from '../tokens.js';
import { Public } from './public.decorator.js';
import { CreateSessionRequestDto } from './dto/create-session.dto.js';
import { LoginRequestDto } from './dto/login-request.dto.js';
import { SESSION_COOKIE_NAME } from './api-token.guard.js';

/**
 * Two ways into the same session cookie (ADR-0014's mechanism, unchanged):
 * `POST /session` exchanges a real API token (CI/programmatic clients,
 * ADR-0016); `POST /login` exchanges a @curatal.com email address with no
 * password or verification yet (ADR-0022, explicit interim decision) —
 * the browser UI only shows the second one.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly validateApiToken: ValidateApiTokenUseCase;
  private readonly loginWithEmail: LoginWithEmailUseCase;

  constructor(
    @Inject(API_TOKEN_REPOSITORY) apiTokenRepository: ApiTokenRepository,
    @Inject(ORG_REPOSITORY) orgRepository: OrgRepository,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
  ) {
    this.validateApiToken = new ValidateApiTokenUseCase(apiTokenRepository);
    this.loginWithEmail = new LoginWithEmailUseCase(
      orgRepository,
      userRepository,
      apiTokenRepository,
    );
  }

  @Public()
  @Post('session')
  async createSession(
    @Body() dto: CreateSessionRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.validateApiToken.execute(dto.token);
    if (!result) {
      throw new UnauthorizedException('Invalid or revoked token');
    }

    this.setSessionCookie(res, dto.token);
    return { status: 'ok' };
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginRequestDto, @Res({ passthrough: true }) res: Response) {
    try {
      const { rawToken } = await this.loginWithEmail.execute(dto.email);
      this.setSessionCookie(res, rawToken);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidEmailDomainError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}
