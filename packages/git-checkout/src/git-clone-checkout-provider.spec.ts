import { describe, expect, it } from 'vitest';
import { cloneUrl } from './git-clone-checkout-provider.js';

describe('cloneUrl', () => {
  it('embeds a GitHub token as the URL username, no password (live-reproduced convention)', () => {
    const url = cloneUrl(
      { provider: 'github', remoteUrl: 'https://github.com/org/repo.git' },
      'ghp_realtoken',
    );

    expect(url).toBe('https://ghp_realtoken@github.com/org/repo.git');
  });

  it('embeds a GitLab token as the password with an "oauth2" username placeholder (live-reproduced fix)', () => {
    const url = cloneUrl(
      { provider: 'gitlab', remoteUrl: 'https://gitlab.com/org/repo.git' },
      'glpat-realtoken',
    );

    expect(url).toBe('https://oauth2:glpat-realtoken@gitlab.com/org/repo.git');
  });

  it('returns the remote URL unchanged when no token is given (a public repo)', () => {
    expect(
      cloneUrl({ provider: 'github', remoteUrl: 'https://github.com/org/repo.git' }, undefined),
    ).toBe('https://github.com/org/repo.git');
    expect(
      cloneUrl({ provider: 'gitlab', remoteUrl: 'https://gitlab.com/org/repo.git' }, undefined),
    ).toBe('https://gitlab.com/org/repo.git');
  });

  it('never puts the raw token anywhere but the URL credentials — confirms nothing leaks into the path/query', () => {
    const url = cloneUrl(
      { provider: 'gitlab', remoteUrl: 'https://gitlab.example.com/group/sub/repo.git' },
      'glpat-secret',
    );

    expect(url).toBe('https://oauth2:glpat-secret@gitlab.example.com/group/sub/repo.git');
  });
});
