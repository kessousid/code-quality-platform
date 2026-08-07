import { describe, expect, it } from 'vitest';
import {
  InMemoryApiTokenRepository,
  InMemoryAuthTokenRepository,
  InMemoryEmailSender,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from './testing/index.js';
import { InvalidEmailDomainError } from './curatal-domain.js';
import { SignupUseCase } from './signup.use-case.js';
import { VerifyEmailUseCase } from './verify-email.use-case.js';
import { hashApiToken } from './api-token-hash.js';
import {
  AccountNotVerifiedError,
  InvalidCredentialsError,
  LoginUseCase,
  PasswordNotSetError,
} from './login.use-case.js';

const WEB_BASE_URL = 'https://app.example.com';

function setUp() {
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
  const verifyEmail = new VerifyEmailUseCase(
    userRepository,
    authTokenRepository,
    apiTokenRepository,
  );
  const useCase = new LoginUseCase(userRepository, apiTokenRepository);

  async function signUpAndVerify(email: string, password: string) {
    await signup.execute(email, password);
    const link = emailSender.sent.at(-1)!.body;
    const rawToken = new URL(link.match(/https:\S+/)![0]).searchParams.get('token')!;
    await verifyEmail.execute(rawToken);
  }

  return { userRepository, apiTokenRepository, signup, signUpAndVerify, useCase };
}

describe('LoginUseCase', () => {
  it('rejects any domain other than curatal.com', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('someone@gmail.com', 'whatever')).rejects.toThrow(
      InvalidEmailDomainError,
    );
  });

  it('rejects an email that was never signed up, with a generic message', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('nobody@curatal.com', 'whatever')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects the wrong password, with the same generic message as an unknown email', async () => {
    const { useCase, signUpAndVerify } = setUp();
    await signUpAndVerify('real@curatal.com', 'the-real-password');

    await expect(useCase.execute('real@curatal.com', 'wrong-password')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects login before the account is verified', async () => {
    const { useCase, signup } = setUp();
    await signup.execute('unverified@curatal.com', 'a-real-password');

    await expect(useCase.execute('unverified@curatal.com', 'a-real-password')).rejects.toThrow(
      AccountNotVerifiedError,
    );
  });

  it('rejects login for a legacy (pre-password) account, directing to Forgot Password', async () => {
    const { useCase, userRepository } = setUp();
    // Simulates a user created by the old ADR-0022 email-only login: active, but never given a password.
    await userRepository.create({
      orgId: 'org_1',
      email: 'legacy@curatal.com',
      name: 'legacy',
      status: 'active',
    });

    await expect(useCase.execute('legacy@curatal.com', 'anything')).rejects.toThrow(
      PasswordNotSetError,
    );
  });

  it('logs in successfully with the right email/password and returns a usable token, revoking any prior one', async () => {
    const { useCase, signUpAndVerify, apiTokenRepository } = setUp();
    await signUpAndVerify('good@curatal.com', 'the-real-password');

    const first = await useCase.execute('good@curatal.com', 'the-real-password');
    const second = await useCase.execute('good@curatal.com', 'the-real-password');

    expect(second.user.id).toBe(first.user.id);
    expect(second.rawToken).not.toBe(first.rawToken);

    const firstStillValid = await apiTokenRepository.findActiveByHash(hashApiToken(first.rawToken));
    expect(firstStillValid).toBeNull();
    const secondValid = await apiTokenRepository.findActiveByHash(hashApiToken(second.rawToken));
    expect(secondValid).not.toBeNull();
  });
});
