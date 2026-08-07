import { randomBytes } from 'node:crypto';
import type { AuthTokenRepository, EmailSender, OrgRepository, UserRepository } from '@cqp/core';
import { normalizeAndAssertCuratalEmail } from './curatal-domain.js';
import { hashPassword } from './password-hash.js';
import { hashApiToken } from './api-token-hash.js';

/** The only place the shared org slug is hardcoded for signup — mirrors LoginWithEmailUseCase (docs/adr/0022, docs/adr/0041). */
const SHARED_ORG_SLUG = 'curatal';
const SHARED_ORG_NAME = 'Curatal';

/** Also used by ResetPasswordUseCase — the same minimum applies whether a password is set at signup or via reset. */
export const MIN_PASSWORD_LENGTH = 8;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class PasswordTooWeakError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = 'PasswordTooWeakError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`${email} is already registered.`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/**
 * Replaces ADR-0022's passwordless login with a real signup (docs/adr/0041):
 * the account is created `pending_verification` and cannot log in
 * (LoginUseCase checks this) until the emailed link is clicked
 * (VerifyEmailUseCase). Mirrors LoginWithEmailUseCase's find-or-create
 * shared-org shape, since every @curatal.com signup still lands in the
 * same one workspace — signup only changes how a *user* comes into
 * existence, not the org model.
 */
export class SignupUseCase {
  constructor(
    private readonly orgRepository: OrgRepository,
    private readonly userRepository: UserRepository,
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly emailSender: EmailSender,
    /** e.g. "https://web-production-xxxx.up.railway.app" — no trailing slash. */
    private readonly webBaseUrl: string,
  ) {}

  async execute(rawEmail: string, password: string): Promise<void> {
    const email = normalizeAndAssertCuratalEmail(rawEmail);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new PasswordTooWeakError();
    }

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError(email);
    }

    let org = await this.orgRepository.findBySlug(SHARED_ORG_SLUG);
    if (!org) {
      org = await this.orgRepository.create({ name: SHARED_ORG_NAME, slug: SHARED_ORG_SLUG });
    }

    const passwordHash = await hashPassword(password);
    const name = email.split('@')[0]!;
    const user = await this.userRepository.create({
      orgId: org.id,
      email,
      name,
      passwordHash,
      status: 'pending_verification',
    });

    const rawToken = randomBytes(32).toString('hex');
    await this.authTokenRepository.create({
      userId: user.id,
      purpose: 'email_verification',
      tokenHash: hashApiToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });

    const verifyUrl = `${this.webBaseUrl}/verify-email?token=${rawToken}`;
    await this.emailSender.send({
      to: email,
      subject: 'Verify your email — Code Quality & Security Assessment Platform',
      body: `Welcome! Click the link below to verify your email and activate your account:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't sign up, you can ignore this email.`,
    });
  }
}
