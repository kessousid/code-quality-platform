import { describe, expect, it } from 'vitest';
import { toRepoRelativeTarget } from './to-repo-relative-target.js';

describe('toRepoRelativeTarget', () => {
  it('returns the path unchanged when there is no localPath to strip', () => {
    expect(toRepoRelativeTarget('C:\\Users\\pvpl1\\work\\Backend\\interview', undefined)).toBe(
      'C:\\Users\\pvpl1\\work\\Backend\\interview',
    );
  });

  it('returns "." when the browsed path is exactly the repo root', () => {
    expect(toRepoRelativeTarget('C:\\Users\\pvpl1\\work', 'C:\\Users\\pvpl1\\work')).toBe('.');
  });

  it('strips the repo root prefix for a subpath', () => {
    expect(
      toRepoRelativeTarget('C:\\Users\\pvpl1\\work\\Backend\\interview', 'C:\\Users\\pvpl1\\work'),
    ).toBe('Backend\\interview');
  });

  it('strips the prefix even when localPath has a trailing slash the browsed path does not (real incident)', () => {
    // localPath typed by hand at repo-creation time with a trailing "\" (e.g. pasted from Explorer's
    // address bar); the browse picker's path never has one (node:path's resolve() always strips it). A
    // naive startsWith() here used to fail silently and submit the full absolute path as "relative",
    // which then broke discoverSourceFiles's join(repoRoot, targetPath).
    expect(
      toRepoRelativeTarget(
        'C:\\Users\\pvpl1\\work\\Backend\\interview',
        'C:\\Users\\pvpl1\\work\\',
      ),
    ).toBe('Backend\\interview');
  });

  it('still returns "." when both sides differ only by a trailing slash', () => {
    expect(toRepoRelativeTarget('C:\\Users\\pvpl1\\work', 'C:\\Users\\pvpl1\\work\\')).toBe('.');
  });

  it('falls back to the raw path when it is not actually under localPath', () => {
    expect(toRepoRelativeTarget('D:\\other\\place', 'C:\\Users\\pvpl1\\work')).toBe(
      'D:\\other\\place',
    );
  });
});
