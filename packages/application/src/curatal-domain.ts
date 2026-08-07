/**
 * The one place `curatal.com` is hardcoded (see docs/adr/0022, docs/adr/0041)
 * — shared by signup, login, and password-reset so the rule is spelled
 * out exactly once, not copy-pasted across every use case that touches
 * an email address. Previously lived only inside LoginWithEmailUseCase;
 * pulled out once a second use case (signup) needed the exact same check.
 */
export const ALLOWED_EMAIL_DOMAIN = 'curatal.com';

export class InvalidEmailDomainError extends Error {
  constructor(email: string) {
    super(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses may sign in (got: ${email})`);
    this.name = 'InvalidEmailDomainError';
  }
}

/** Normalizes (trim + lowercase) and asserts the domain in one step — every caller needs both. */
export function normalizeAndAssertCuratalEmail(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  const domain = email.split('@')[1];
  if (domain !== ALLOWED_EMAIL_DOMAIN) {
    throw new InvalidEmailDomainError(email);
  }
  return email;
}
