import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Inject,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AccountNotVerifiedError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidEmailDomainError,
  InvalidOrExpiredTokenError,
  LoginUseCase,
  PasswordNotSetError,
  PasswordTooWeakError,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignupUseCase,
  ValidateApiTokenUseCase,
  VerifyEmailUseCase,
} from '@cqp/application';
import type {
  ApiTokenRepository,
  AuthTokenRepository,
  EmailSender,
  OrgRepository,
  UserRepository,
} from '@cqp/core';
import {
  API_TOKEN_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  EMAIL_SENDER,
  ORG_REPOSITORY,
  USER_REPOSITORY,
} from '../tokens.js';
import { Public } from './public.decorator.js';
import { CreateSessionRequestDto } from './dto/create-session.dto.js';
import { LoginRequestDto } from './dto/login-request.dto.js';
import { SignupRequestDto } from './dto/signup-request.dto.js';
import { VerifyEmailRequestDto } from './dto/verify-email-request.dto.js';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto.js';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto.js';
import { SESSION_COOKIE_NAME } from './api-token.guard.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Real signup + password + email verification/reset (docs/adr/0041),
 * replacing ADR-0022's passwordless email-only login. `POST /session`
 * (a real API token, CI/programmatic clients, ADR-0016) is the one
 * thing unchanged from ADR-0014.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly validateApiToken: ValidateApiTokenUseCase;
  private readonly login: LoginUseCase;
  private readonly signup: SignupUseCase;
  private readonly verifyEmail: VerifyEmailUseCase;
  private readonly requestPasswordReset: RequestPasswordResetUseCase;
  private readonly resetPassword: ResetPasswordUseCase;

  constructor(
    @Inject(API_TOKEN_REPOSITORY) apiTokenRepository: ApiTokenRepository,
    @Inject(ORG_REPOSITORY) orgRepository: OrgRepository,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(AUTH_TOKEN_REPOSITORY) authTokenRepository: AuthTokenRepository,
    @Inject(EMAIL_SENDER) emailSender: EmailSender,
  ) {
    const webBaseUrl = requireEnv('WEB_BASE_URL');

    this.validateApiToken = new ValidateApiTokenUseCase(apiTokenRepository);
    this.login = new LoginUseCase(userRepository, apiTokenRepository);
    this.signup = new SignupUseCase(
      orgRepository,
      userRepository,
      authTokenRepository,
      emailSender,
      webBaseUrl,
    );
    this.verifyEmail = new VerifyEmailUseCase(
      userRepository,
      authTokenRepository,
      apiTokenRepository,
    );
    this.requestPasswordReset = new RequestPasswordResetUseCase(
      userRepository,
      authTokenRepository,
      emailSender,
      webBaseUrl,
    );
    this.resetPassword = new ResetPasswordUseCase(
      userRepository,
      authTokenRepository,
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
  async loginRoute(@Body() dto: LoginRequestDto, @Res({ passthrough: true }) res: Response) {
    try {
      const { rawToken } = await this.login.execute(dto.email, dto.password);
      this.setSessionCookie(res, rawToken);
      return { status: 'ok' };
    } catch (error) {
      if (
        error instanceof InvalidEmailDomainError ||
        error instanceof InvalidCredentialsError ||
        error instanceof AccountNotVerifiedError ||
        error instanceof PasswordNotSetError
      ) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  @Public()
  @Post('signup')
  async signupRoute(@Body() dto: SignupRequestDto) {
    try {
      await this.signup.execute(dto.email, dto.password);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidEmailDomainError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof PasswordTooWeakError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Public()
  @Post('verify-email')
  async verifyEmailRoute(
    @Body() dto: VerifyEmailRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { rawToken } = await this.verifyEmail.execute(dto.token);
      this.setSessionCookie(res, rawToken);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidOrExpiredTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  @Public()
  @Post('forgot-password')
  async forgotPasswordRoute(@Body() dto: ForgotPasswordRequestDto) {
    try {
      await this.requestPasswordReset.execute(dto.email);
    } catch (error) {
      if (error instanceof InvalidEmailDomainError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
    // Always the same response, whether or not the email had an account (anti-enumeration, docs/adr/0041).
    return { status: 'ok' };
  }

  @Public()
  @Post('reset-password')
  async resetPasswordRoute(
    @Body() dto: ResetPasswordRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { rawToken } = await this.resetPassword.execute(dto.token, dto.password);
      this.setSessionCookie(res, rawToken);
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof InvalidOrExpiredTokenError) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof PasswordTooWeakError) {
        throw new BadRequestException(error.message);
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
