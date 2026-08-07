import { describe, expect, it } from 'vitest';
import {
  InMemoryApiTokenRepository,
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from './testing/index.js';
import { SignupUseCase } from './signup.use-case.js';
import { InvalidOrExpiredTokenError, VerifyEmailUseCase } from './verify-email.use-case.js';
import { hashApiToken } from './api-token-hash.js';

const WEB_BASE_URL = 'https://app.example.com';

async function setUp() {
  const orgRepository = new InMemoryOrgRepository();
  const userRepository = new InMemoryUserRepository();
  const authTokenRepository = new InMemoryAuthTokenRepository();
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const emailSender = new InMemoryEmailSender();
  const signup = new SignupUseCase(
    orgRepository,
    userRepository,
    authTokenRepository,
    emailSender,
    WEB_BASE_URL,
  );
  const useCase = new VerifyEmailUseCase(userRepository, authTokenRepository, apiTokenRepository);

  await signup.execute('new@curatal.com', 'a-real-password');
  const link = emailSender.sent[0]!.body;
  const rawToken = new URL(link.match(/https:\S+/)![0]).searchParams.get('token')!;

  return { userRepository, authTokenRepository, apiTokenRepository, useCase, rawToken };
}

describe('VerifyEmailUseCase', () => {
  it('activates a pending_verification user and returns a usable session token', async () => {
    const { useCase, userRepository, apiTokenRepository, rawToken } = await setUp();

    const result = await useCase.execute(rawToken);

    expect(result.user.status).toBe('active');
    const persisted = await userRepository.findByEmail('new@curatal.com');
    expect(persisted?.status).toBe('active');

    const validated = await apiTokenRepository.findActiveByHash(hashApiToken(result.rawToken));
    expect(validated?.orgId).toBe(result.user.orgId);
  });

  it('rejects an unknown token', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('not-a-real-token')).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('rejects reusing an already-verified token', async () => {
    const { useCase, rawToken } = await setUp();
    await useCase.execute(rawToken);
    await expect(useCase.execute(rawToken)).rejects.toThrow(InvalidOrExpiredTokenError);
  });

  it('rejects an expired token', async () => {
    const { useCase, authTokenRepository, userRepository } = await setUp();
    const user = await userRepository.findByEmail('new@curatal.com');
    // Simulate time passing: invalidate the real token and issue an already-expired one in its place.
    await authTokenRepository.invalidateAllForUser(user!.id, 'email_verification');
    const expiredRaw = 'expired-token';
    await authTokenRepository.create({
      userId: user!.id,
      purpose: 'email_verification',
      tokenHash: hashApiToken(expiredRaw),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(useCase.execute(expiredRaw)).rejects.toThrow(InvalidOrExpiredTokenError);
  });
});
