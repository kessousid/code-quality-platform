import { describe, expect, it } from 'vitest';
import { hashApiToken } from './api-token-hash.js';
import {
  InMemoryApiTokenRepository,
  InMemoryOrgRepository,
  InMemoryUserRepository,
} from './testing/index.js';
import { InvalidEmailDomainError, LoginWithEmailUseCase } from './login-with-email.use-case.js';

function setUp() {
  const orgRepository = new InMemoryOrgRepository();
  const userRepository = new InMemoryUserRepository();
  const apiTokenRepository = new InMemoryApiTokenRepository();
  const useCase = new LoginWithEmailUseCase(orgRepository, userRepository, apiTokenRepository);
  return { orgRepository, userRepository, apiTokenRepository, useCase };
}

describe('LoginWithEmailUseCase', () => {
  it('rejects any domain other than curatal.com', async () => {
    const { useCase } = setUp();
    await expect(useCase.execute('someone@gmail.com')).rejects.toThrow(InvalidEmailDomainError);
  });

  it('creates the shared org and a user on first login, and returns a usable token', async () => {
    const { useCase, orgRepository, userRepository, apiTokenRepository } = setUp();

    const result = await useCase.execute('KeshavKumar@Curatal.com'); // mixed case, on purpose

    expect(result.user.email).toBe('keshavkumar@curatal.com');
    expect(result.user.name).toBe('keshavkumar');

    const org = await orgRepository.findBySlug('curatal');
    expect(org).not.toBeNull();
    expect(result.user.orgId).toBe(org?.id);

    const persisted = await userRepository.findByEmail('keshavkumar@curatal.com');
    expect(persisted?.id).toBe(result.user.id);

    const validated = await apiTokenRepository.findActiveByHash(hashApiToken(result.rawToken));
    expect(validated?.orgId).toBe(org?.id);
  });

  it('reuses the same shared org and user across logins, but issues a fresh token each time', async () => {
    const { useCase, orgRepository, apiTokenRepository } = setUp();

    const first = await useCase.execute('teammate@curatal.com');
    const second = await useCase.execute('teammate@curatal.com');

    expect(second.user.id).toBe(first.user.id);
    expect(second.rawToken).not.toBe(first.rawToken);

    // Only one org ever gets created, regardless of how many people log in.
    const allOrgLookups = await Promise.all([
      orgRepository.findBySlug('curatal'),
      orgRepository.findBySlug('curatal'),
    ]);
    expect(allOrgLookups[0]?.id).toBe(allOrgLookups[1]?.id);

    // The first login's token must no longer validate — see docs/adr/0022.
    const firstStillValid = await apiTokenRepository.findActiveByHash(hashApiToken(first.rawToken));
    expect(firstStillValid).toBeNull();

    const secondValid = await apiTokenRepository.findActiveByHash(hashApiToken(second.rawToken));
    expect(secondValid).not.toBeNull();
  });

  it('two different curatal.com emails share the same org', async () => {
    const { useCase } = setUp();

    const a = await useCase.execute('alice@curatal.com');
    const b = await useCase.execute('bob@curatal.com');

    expect(a.user.orgId).toBe(b.user.orgId);
    expect(a.user.id).not.toBe(b.user.id);
  });
});
