import { describe, expect, it } from 'vitest';
import {
  InMemoryApiTokenRepository,
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryUserRepository,
} from './testing/index.js';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case.js';
import { ResetPasswordUseCase } from './reset-password.use-case.js';
import { InvalidOrExpiredTokenError } from './verify-email.use-case.js';
import { PasswordTooWeakError } from './signup.use-case.js';
import { verifyPassword } from './password-hash.js';
import { hashApiToken } from './api-token-hash.js';

const WEB_BASE_URL = 'https://app.example.com';

function setUp() {
  const userRepository = new InMemoryUserRepository();
  const authTokenRepository = new InMemoryAuthTokenRepository();
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const emailSender = new InMemoryEmailSender();
  const requestReset = new RequestPasswordResetUseCase(
    userRepository,
    authTokenRepository,
    emailSender,
    WEB_BASE_URL,
  );
  const useCase = new ResetPasswordUseCase(userRepository, authTokenRepository, apiTokenRepository);

  async function requestResetAndGetToken(email: string) {
    await requestReset.execute(email);
    const link = emailSender.sent.at(-1)!.body;
    return new URL(link.match(/https:\S+/)![0]).searchParams.get('token')!;
  }

  return {
    userRepository,
    authTokenRepository,
    apiTokenRepository,
    useCase,
    requestResetAndGetToken,
  };
}

describe('ResetPasswordUseCase', () => {
  it('rejects a new password shorter than 8 characters', async () => {
    const { useCase, userRepository, requestResetAndGetToken } = setUp();
    await userRepository.create({ orgId: 'org_1', email: 'real@curatal.com', name: 'real' });
    const rawToken = await requestResetAndGetToken('real@curatal.com');

    await expect(useCase.execute(rawToken, 'short')).rejects.toThrow(PasswordTooWeakError);
  });

  it('rejects an unknown or already-used token', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('not-a-real-token', 'a-real-password')).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });

  it('sets a real hashed password, activates the account, and returns a usable session token', async () => {
    const { useCase, userRepository, apiTokenRepository, requestResetAndGetToken } = setUp();
    // A legacy (ADR-0022) account: active already, but no password ever set.
    await userRepository.create({
      orgId: 'org_1',
      email: 'legacy@curatal.com',
      name: 'legacy',
      status: 'active',
    });
    const rawToken = await requestResetAndGetToken('legacy@curatal.com');

    const result = await useCase.execute(rawToken, 'a-brand-new-password');

    expect(result.user.status).toBe('active');
    const persisted = await userRepository.findByEmail('legacy@curatal.com');
    await expect(verifyPassword('a-brand-new-password', persisted!.passwordHash!)).resolves.toBe(
      true,
    );

    const validated = await apiTokenRepository.findActiveByHash(hashApiToken(result.rawToken));
    expect(validated?.orgId).toBe(result.user.orgId);
  });

  it('also activates a never-verified pending account, since a real reset link only reaches the real inbox', async () => {
    const { useCase, userRepository, requestResetAndGetToken } = setUp();
    await userRepository.create({
      orgId: 'org_1',
      email: 'pending@curatal.com',
      name: 'pending',
      status: 'pending_verification',
    });
    const rawToken = await requestResetAndGetToken('pending@curatal.com');

    const result = await useCase.execute(rawToken, 'a-brand-new-password');

    expect(result.user.status).toBe('active');
  });

  it('rejects reusing the same reset token twice', async () => {
    const { useCase, userRepository, requestResetAndGetToken } = setUp();
    await userRepository.create({ orgId: 'org_1', email: 'real@curatal.com', name: 'real' });
    const rawToken = await requestResetAndGetToken('real@curatal.com');

    await useCase.execute(rawToken, 'first-new-password');
    await expect(useCase.execute(rawToken, 'second-new-password')).rejects.toThrow(
      InvalidOrExpiredTokenError,
    );
  });
});
