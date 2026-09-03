import { describe, expect, it } from 'vitest';
import { redactUrlCredentials } from './redact-url-credentials.js';

describe('redactUrlCredentials', () => {
  it('redacts a GitHub PAT embedded as the URL username', () => {
    const text =
      "fatal: could not read Password for 'https://ghp_abc123XYZ@github.com': No such device or address";
    expect(redactUrlCredentials(text)).toBe(
      "fatal: could not read Password for 'https://***REDACTED***@github.com': No such device or address",
    );
  });

  it('redacts a GitLab-style user:token pair', () => {
    const text = 'Cloning https://oauth2:glpat-abc123@gitlab.com/org/repo.git';
    expect(redactUrlCredentials(text)).toBe(
      'Cloning https://***REDACTED***@gitlab.com/org/repo.git',
    );
  });

  it('redacts multiple credentialed URLs in the same text', () => {
    const text = 'first https://tok1@github.com/a and second https://tok2@github.com/b';
    expect(redactUrlCredentials(text)).toBe(
      'first https://***REDACTED***@github.com/a and second https://***REDACTED***@github.com/b',
    );
  });

  it('leaves a credential-free URL unchanged', () => {
    const text = 'Cloning into https://github.com/codewithVsingh/curatal_tests.git';
    expect(redactUrlCredentials(text)).toBe(text);
  });

  it('leaves plain text with no URL unchanged', () => {
    const text = 'exit code 1, no such file or directory';
    expect(redactUrlCredentials(text)).toBe(text);
  });
});
