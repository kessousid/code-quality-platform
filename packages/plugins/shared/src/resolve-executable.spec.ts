import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExecutablePath } from './resolve-executable.js';

describe('resolveExecutablePath', () => {
  afterEach(() => {
    delete process.env.CQP_TEST_TOOL_PATH;
    vi.unstubAllGlobals();
  });

  it('prefers the env var override when set', () => {
    process.env.CQP_TEST_TOOL_PATH = 'C:\\custom\\tool.exe';
    expect(resolveExecutablePath('CQP_TEST_TOOL_PATH', 'tool')).toBe('C:\\custom\\tool.exe');
  });

  it('ignores a blank env var override', () => {
    process.env.CQP_TEST_TOOL_PATH = '   ';
    const result = resolveExecutablePath('CQP_TEST_TOOL_PATH', 'tool');
    expect(result).not.toBe('   ');
  });

  it('appends .exe to the fallback command on win32 with no override', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      expect(resolveExecutablePath('CQP_TEST_TOOL_PATH', 'tool')).toBe('tool.exe');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('leaves the fallback command bare on non-Windows platforms', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      expect(resolveExecutablePath('CQP_TEST_TOOL_PATH', 'tool')).toBe('tool');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});
