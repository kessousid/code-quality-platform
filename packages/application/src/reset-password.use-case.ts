import type { ApiTokenRepository, AuthTokenRepository, User, UserRepository } from '@cqp/core';
import { hashApiToken } from './api-token-hash.js';
import { hashPassword } from './password-hash.js';
import { CreateApiTokenUseCase } from './create-api-token.use-case.js';
import { InvalidOrExpiredTokenError } from './verify-email.use-case.js';
import { MIN_PASSWORD_LENGTH, PasswordTooWeakError } from './signup.use-case.js';

export interface ResetPasswordResult {
  user: User;
  /** Same auto-login shape as VerifyEmailUseCase — proving inbox ownership logs you straight in (docs/adr/0041). */
  rawToken: string;
}

/**
 * The other half of RequestPasswordResetUseCase (docs/adr/0041). Also
 * activates the account as a side effect — a legacy (ADR-0022,
 * never-had-a-password) or never-verified account that successfully
 * used a real password-reset link delivered to its inbox has, by that
 * same act, proven ownership just as much as clicking a verification
 * link would.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly apiTokenRepository: ApiTokenRepository,
  ) {}

  async execute(rawToken: string, newPassword: string): Promise<ResetPasswordResult> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new PasswordTooWeakError();
    }

    const authToken = await this.authTokenRepository.findActiveByHash(
      hashApiToken(rawToken),
      'password_reset',
    );
    if (!authToken) {
      throw new InvalidOrExpiredTokenError();
    }

    const user = await this.userRepository.findById(authToken.userId);
    if (!user) {
      throw new InvalidOrExpiredTokenError();
    }

    await this.authTokenRepository.markUsed(authToken.id);
    const passwordHash = await hashPassword(newPassword);
    await this.userRepository.updatePassword(user.id, passwordHash);
    const activated = user.status === 'active' ? user : await this.userRepository.activate(user.id);

    await this.apiTokenRepository.revokeAllByName(activated.orgId, activated.email);
    const { rawToken: sessionToken } = await new CreateApiTokenUseCase(
      this.apiTokenRepository,
    ).execute(activated.orgId, activated.email);

    return { user: activated, rawToken: sessionToken };
  }
}
