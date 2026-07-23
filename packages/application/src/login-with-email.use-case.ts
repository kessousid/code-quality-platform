import type { ApiTokenRepository, OrgRepository, User, UserRepository } from '@cqp/core';
import { CreateApiTokenUseCase } from './create-api-token.use-case.js';

/** The only place `curatal.com` and the shared org slug are hardcoded — see docs/adr/0022. */
const ALLOWED_EMAIL_DOMAIN = 'curatal.com';
const SHARED_ORG_SLUG = 'curatal';
const SHARED_ORG_NAME = 'Curatal';

export class InvalidEmailDomainError extends Error {
  constructor(email: string) {
    super(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses may sign in (got: ${email})`);
    this.name = 'InvalidEmailDomainError';
  }
}

export interface LoginResult {
  user: User;
  /** Shown to the caller exactly once, immediately set as the session cookie — never stored raw (ADR-0014). */
  rawToken: string;
}

/**
 * No password, no email verification — an explicit, deliberate interim
 * decision (docs/adr/0022), not a forgotten gap. Reuses the exact
 * ApiTokenGuard/session-cookie machinery ADR-0014 already built: a login
 * is "the server mints you a token and remembers whose it is," not a
 * parallel auth system.
 */
export class LoginWithEmailUseCase {
  constructor(
    private readonly orgRepository: OrgRepository,
    private readonly userRepository: UserRepository,
    private readonly apiTokenRepository: ApiTokenRepository,
  ) {}

  async execute(rawEmail: string): Promise<LoginResult> {
    const email = rawEmail.trim().toLowerCase();
    const domain = email.split('@')[1];
    if (domain !== ALLOWED_EMAIL_DOMAIN) {
      throw new InvalidEmailDomainError(email);
    }

    let org = await this.orgRepository.findBySlug(SHARED_ORG_SLUG);
    if (!org) {
      org = await this.orgRepository.create({ name: SHARED_ORG_NAME, slug: SHARED_ORG_SLUG });
    }

    let user = await this.userRepository.findByEmail(email);
    if (!user) {
      const name = email.split('@')[0]!;
      user = await this.userRepository.create({ orgId: org.id, email, name });
    }

    // A fresh token per login, previous one(s) revoked — see docs/adr/0022
    // for why (ApiToken only ever stores a hash; a prior raw value was
    // never retrievable again regardless).
    await this.apiTokenRepository.revokeAllByName(org.id, user.email);
    const { rawToken } = await new CreateApiTokenUseCase(this.apiTokenRepository).execute(
      org.id,
      user.email,
    );

    return { user, rawToken };
  }
}
