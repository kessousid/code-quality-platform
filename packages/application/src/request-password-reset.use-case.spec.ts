import { describe, expect, it } from 'vitest';
import {
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryUserRepository,
} from './testing/index.js';
import { InvalidEmailDomainError } from './curatal-domain.js';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case.js';
import { hashApiToken } from './api-token-hash.js';

const WEB_BASE_URL = 'https://app.example.com';

function setUp() {
  const userRepository = new InMemoryUserRepository();
  const authTokenRepository = new InMemoryAuthTokenRepository();
  const emailSender = new InMemoryEmailSender();
  const useCase = new RequestPasswordResetUseCase(
    userRepository,
    authTokenRepository,
    emailSender,
    WEB_BASE_URL,
  );
  return { userRepository, authTokenRepository, emailSender, useCase };
}

describe('RequestPasswordResetUseCase', () => {
  it('rejects any domain other than curatal.com', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('someone@gmail.com')).rejects.toThrow(InvalidEmailDomainError);
  });

  it('silently succeeds for an email with no account, sending nothing (anti-enumeration)', async () => {
    const { useCase, emailSender } = setUp();
    await expect(useCase.execute('nobody@curatal.com')).resolves.toBeUndefined();
    expect(emailSender.sent).toHaveLength(0);
  });

  it('emails a real reset link for a real account', async () => {
    const { useCase, userRepository, emailSender } = setUp();
    await userRepository.create({ orgId: 'org_1', email: 'real@curatal.com', name: 'real' });

    await useCase.execute('Real@Curatal.com'); // mixed case, on purpose

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('real@curatal.com');
    expect(emailSender.sent[0]?.body).toContain(`${WEB_BASE_URL}/reset-password?token=`);
  });

  it('invalidates a previous unused reset token when a new one is requested', async () => {
    const { useCase, userRepository, authTokenRepository, emailSender } = setUp();
    const user = await userRepository.create({
      orgId: 'org_1',
      email: 'real@curatal.com',
      name: 'real',
    });

    await useCase.execute('real@curatal.com');
    const firstLink = emailSender.sent[0]!.body;
    const firstRawToken = new URL(firstLink.match(/https:\S+/)![0]).searchParams.get('token')!;

    await useCase.execute('real@curatal.com');

    const firstStillActive = await authTokenRepository.findActiveByHash(
      hashApiToken(firstRawToken),
      'password_reset',
    );
    expect(firstStillActive).toBeNull();
    expect(user.id).toBeDefined();
  });
});
