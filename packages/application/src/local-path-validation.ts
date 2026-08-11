/**
 * Confirmed live (docs/adr/0051): a repo registered with `localPath`
 * pointing at a user's entire home directory instead of a real project
 * folder doesn't fail cleanly — `ensureJestAvailable` happily runs
 * `npm install --save-dev jest` straight into that home directory
 * (creating a stray `package.json`/`node_modules` there), and whatever
 * files a `target` subfolder happens to contain get treated as the
 * project's own source. The failure that eventually surfaces (a
 * misleading "no tests found" 24 minutes into a run) gives no hint the
 * real problem is the registered path itself. Catching this at
 * repo-creation time, immediately and clearly, beats every downstream
 * symptom it can otherwise cause.
 */
const HOME_DIRECTORY_PATTERNS = [
  /^[a-zA-Z]:[\\/]Users[\\/][^\\/]+[\\/]?$/, // Windows: C:\Users\name
  /^\/home\/[^/]+\/?$/, // Linux: /home/name
  /^\/Users\/[^/]+\/?$/, // macOS: /Users/name
];

export function looksLikeHomeDirectory(localPath: string): boolean {
  const trimmed = localPath.trim();
  return HOME_DIRECTORY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export class HomeDirectoryLocalPathError extends Error {
  constructor(localPath: string) {
    super(
      `"${localPath}" looks like your entire user home directory, not a project folder. ` +
        'Point localPath at the specific project you want to scan or test — a folder that ' +
        'directly contains its own package.json — not the folder that contains all of your projects.',
    );
    this.name = 'HomeDirectoryLocalPathError';
  }
}
