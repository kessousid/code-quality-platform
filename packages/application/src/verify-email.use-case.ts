import type { ApiTokenRepository, AuthTokenRepository, User, UserRepository } from '@cqp/core';
import { hashApiToken } from './api-token-hash.js';
import { CreateApiTokenUseCase } from './create-api-token.use-case.js';

export class InvalidOrExpiredTokenError extends Error {
  constructor() {
    super('This link is invalid or has expired.');
    this.name = 'InvalidOrExpiredTokenError';
  }
}

export interface VerifyEmailResult {
  user: User;
  /** A real session token, same shape as LoginUseCase's — clicking the link logs you straight in (docs/adr/0041). */
  rawToken: string;
}

/**
 * The other half of SignupUseCase (docs/adr/0041) — activates the
 * pending_verification account the emailed link points at, then logs
 * the user straight in (issues a session token) rather than making them
 * separately re-enter their password right after proving they own the
 * inbox.
 */
export class VerifyEmailUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly apiTokenRepository: ApiTokenRepository,
  ) {}

  async execute(rawToken: string): Promise<VerifyEmailResult> {
    const authToken = await this.authTokenRepository.findActiveByHash(
      hashApiToken(rawToken),
      'email_verification',
    );
    if (!authToken) {
      throw new InvalidOrExpiredTokenError();
    }

    const user = await this.userRepository.findById(authToken.userId);
    if (!user) {
      throw new InvalidOrExpiredTokenError();
    }

    await this.authTokenRepository.markUsed(authToken.id);
    const activated = await this.userRepository.activate(user.id);

    await this.apiTokenRepository.revokeAllByName(activated.orgId, activated.email);
    const { rawToken: sessionToken } = await new CreateApiTokenUseCase(
      this.apiTokenRepository,
    ).execute(activated.orgId, activated.email);

    return { user: activated, rawToken: sessionToken };
  }
}
