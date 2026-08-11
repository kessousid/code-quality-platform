import { describe, expect, it } from 'vitest';
import { looksLikeHomeDirectory } from './local-path-validation.js';

describe('looksLikeHomeDirectory', () => {
  it('flags a bare Windows home directory (the live-reproduced case)', () => {
    expect(looksLikeHomeDirectory('C:\\Users\\pvpl1')).toBe(true);
    expect(looksLikeHomeDirectory('C:\\Users\\pvpl1\\')).toBe(true);
    expect(looksLikeHomeDirectory('C:/Users/pvpl1')).toBe(true);
    expect(looksLikeHomeDirectory('D:\\Users\\keshav')).toBe(true);
  });

  it('flags a bare Linux home directory', () => {
    expect(looksLikeHomeDirectory('/home/keshav')).toBe(true);
    expect(looksLikeHomeDirectory('/home/keshav/')).toBe(true);
  });

  it('flags a bare macOS home directory', () => {
    expect(looksLikeHomeDirectory('/Users/keshav')).toBe(true);
  });

  it('does not flag a real project folder nested under a home directory', () => {
    expect(looksLikeHomeDirectory('C:\\Users\\pvpl1\\cod')).toBe(false);
    expect(looksLikeHomeDirectory('C:\\Users\\pvpl1\\projects\\my-app')).toBe(false);
    expect(looksLikeHomeDirectory('/home/keshav/code-quality-platform')).toBe(false);
    expect(looksLikeHomeDirectory('/Users/keshav/dev/my-app')).toBe(false);
  });

  it('does not flag an unrelated absolute path', () => {
    expect(looksLikeHomeDirectory('C:\\CuratalIT\\code-quality-platform')).toBe(false);
    expect(looksLikeHomeDirectory('/var/www/my-app')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(looksLikeHomeDirectory('  C:\\Users\\pvpl1  ')).toBe(true);
  });
});
