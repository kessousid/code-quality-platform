import { describe, expect, it } from 'vitest';
import {
  runSubprocess,
  ToolNotFoundError,
  withUnhandledRejectionsAsWarnings,
} from './run-subprocess.js';

describe('runSubprocess', () => {
  it('captures stdout and a zero exit code for a real command', async () => {
    // process.execPath is always a real, correctly-extensioned absolute
    // path (unlike a bare command name), so this exercises the happy path
    // without depending on the Windows .exe-resolution fix tested elsewhere.
    const result = await runSubprocess(process.execPath, ['--version'], {
      cwd: process.cwd(),
      envVarName: 'CQP_TEST_TOOL_PATH',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('rejects with ToolNotFoundError for a command that does not exist', async () => {
    await expect(
      runSubprocess('this-tool-definitely-does-not-exist', [], {
        cwd: process.cwd(),
        envVarName: 'CQP_TEST_TOOL_PATH',
      }),
    ).rejects.toThrow(ToolNotFoundError);
  });

  it('actually applies a custom env to the spawned child, not just process.env', async () => {
    const result = await runSubprocess(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.CQP_TEST_MARKER ?? "unset")'],
      {
        cwd: process.cwd(),
        envVarName: 'CQP_TEST_TOOL_PATH',
        env: { ...process.env, CQP_TEST_MARKER: 'real-value' },
      },
    );

    expect(result.stdout).toBe('real-value');
  });
});

describe('withUnhandledRejectionsAsWarnings', () => {
  it('adds the flag when NODE_OPTIONS was unset', () => {
    expect(withUnhandledRejectionsAsWarnings({}).NODE_OPTIONS).toBe('--unhandled-rejections=warn');
  });

  it('appends to, rather than clobbers, an existing NODE_OPTIONS', () => {
    expect(
      withUnhandledRejectionsAsWarnings({ NODE_OPTIONS: '--max-old-space-size=4096' }).NODE_OPTIONS,
    ).toBe('--max-old-space-size=4096 --unhandled-rejections=warn');
  });

  it('preserves every other env var untouched', () => {
    const result = withUnhandledRejectionsAsWarnings({
      PATH: '/usr/bin',
      CQP_JEST_PATH: '/some/jest.js',
    });
    expect(result.PATH).toBe('/usr/bin');
    expect(result.CQP_JEST_PATH).toBe('/some/jest.js');
  });
});
