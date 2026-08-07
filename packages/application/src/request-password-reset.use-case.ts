import { randomBytes } from 'node:crypto';
import type { AuthTokenRepository, EmailSender, UserRepository } from '@cqp/core';
import { normalizeAndAssertCuratalEmail } from './curatal-domain.js';
import { hashApiToken } from './api-token-hash.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * "Forgot Password" (docs/adr/0041) — also the migration path for a
 * legacy, never-had-a-password account from ADR-0022 (LoginUseCase's
 * PasswordNotSetError points here). Deliberately anti-enumeration: an
 * unknown email still returns normally (no error, no distinguishable
 * timing-sensitive branch beyond a single extra DB read) — only a real
 * account actually gets an email, but the caller can't tell which
 * happened from the response alone.
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly emailSender: EmailSender,
    private readonly webBaseUrl: string,
  ) {}

  async execute(rawEmail: string): Promise<void> {
    const email = normalizeAndAssertCuratalEmail(rawEmail);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return;
    }

    await this.authTokenRepository.invalidateAllForUser(user.id, 'password_reset');
    const rawToken = randomBytes(32).toString('hex');
    await this.authTokenRepository.create({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: hashApiToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const resetUrl = `${this.webBaseUrl}/reset-password?token=${rawToken}`;
    await this.emailSender.send({
      to: email,
      subject: 'Reset your password — Code Quality & Security Assessment Platform',
      body: `Click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.`,
    });
  }
}
