import type { ApiTokenRepository, User, UserRepository } from '@cqp/core';
import { normalizeAndAssertCuratalEmail } from './curatal-domain.js';
import { verifyPassword } from './password-hash.js';
import { CreateApiTokenUseCase } from './create-api-token.use-case.js';

/** Deliberately generic — never reveals whether the email exists or the password was wrong. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountNotVerifiedError extends Error {
  constructor() {
    super('Please verify your email before logging in — check your inbox for the link.');
    this.name = 'AccountNotVerifiedError';
  }
}

/**
 * A real account exists but has never had a password set — exclusively
 * an account created by ADR-0022's old email-only login, from before
 * ADR-0041. Grandfathered in as `active` (they'd already proven access
 * under the old rules), but "Forgot Password" is how they get their
 * first real password — the migration path is the reset flow itself,
 * not a separate one-time script.
 */
export class PasswordNotSetError extends Error {
  constructor() {
    super('This account has no password yet — use "Forgot Password?" to set one.');
    this.name = 'PasswordNotSetError';
  }
}

export interface LoginResult {
  user: User;
  /** Shown to the caller exactly once, immediately set as the session cookie — never stored raw (ADR-0014). */
  rawToken: string;
}

/**
 * Replaces ADR-0022's passwordless LoginWithEmailUseCase (docs/adr/0041)
 * — email+password now, checked against a real (bcrypt) hash, and a
 * pending_verification account is refused until VerifyEmailUseCase
 * activates it. Reuses the exact same ApiTokenGuard/session-cookie
 * machinery ADR-0014 built; only how you prove who you are changed.
 */
export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly apiTokenRepository: ApiTokenRepository,
  ) {}

  async execute(rawEmail: string, password: string): Promise<LoginResult> {
    const email = normalizeAndAssertCuratalEmail(rawEmail);

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }
    if (user.passwordHash === undefined) {
      throw new PasswordNotSetError();
    }
    if (user.status !== 'active') {
      throw new AccountNotVerifiedError();
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    // A fresh token per login, previous one(s) revoked — see docs/adr/0022
    // for why (ApiToken only ever stores a hash; a prior raw value was
    // never retrievable again regardless).
    await this.apiTokenRepository.revokeAllByName(user.orgId, user.email);
    const { rawToken } = await new CreateApiTokenUseCase(this.apiTokenRepository).execute(
      user.orgId,
      user.email,
    );

    return { user, rawToken };
  }
}
