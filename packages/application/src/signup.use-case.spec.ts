import { describe, expect, it } from 'vitest';
import {
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from './testing/index.js';
import { InvalidEmailDomainError } from './curatal-domain.js';
import { verifyPassword } from './password-hash.js';
import {
  EmailAlreadyRegisteredError,
  PasswordTooWeakError,
  SignupUseCase,
} from './signup.use-case.js';

const WEB_BASE_URL = 'https://app.example.com';

function setUp() {
  const orgRepository = new InMemoryOrgRepository();
  const userRepository = new InMemoryUserRepository();
  const authTokenRepository = new InMemoryAuthTokenRepository();
  const emailSender = new InMemoryEmailSender();
  const useCase = new SignupUseCase(
    orgRepository,
    userRepository,
    authTokenRepository,
    emailSender,
    WEB_BASE_URL,
  );
  return { orgRepository, userRepository, authTokenRepository, emailSender, useCase };
}

describe('SignupUseCase', () => {
  it('rejects any domain other than curatal.com', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('someone@gmail.com', 'a-real-password')).rejects.toThrow(
      InvalidEmailDomainError,
    );
  });

  it('rejects a password shorter than 8 characters', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('new@curatal.com', 'short')).rejects.toThrow(PasswordTooWeakError);
  });

  it('rejects an email that has already signed up', async () => {
    const { useCase } = setUp();
    await useCase.execute('taken@curatal.com', 'a-real-password');
    await expect(useCase.execute('taken@curatal.com', 'a-different-password')).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });

  it('creates a pending_verification user with a real hashed password, and emails a verification link', async () => {
    const { useCase, userRepository, emailSender } = setUp();

    await useCase.execute('KeshavKumar@Curatal.com', 'a-real-password'); // mixed case, on purpose

    const user = await userRepository.findByEmail('keshavkumar@curatal.com');
    expect(user).not.toBeNull();
    expect(user?.status).toBe('pending_verification');
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe('a-real-password'); // never stored raw
    await expect(verifyPassword('a-real-password', user!.passwordHash!)).resolves.toBe(true);

    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe('keshavkumar@curatal.com');
    expect(emailSender.sent[0]?.body).toContain(`${WEB_BASE_URL}/verify-email?token=`);
  });

  it('reuses the same shared org across signups', async () => {
    const { useCase, orgRepository } = setUp();

    await useCase.execute('alice@curatal.com', 'a-real-password');
    await useCase.execute('bob@curatal.com', 'a-real-password');

    const org = await orgRepository.findBySlug('curatal');
    expect(org).not.toBeNull();
  });
});
