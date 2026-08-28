import { describe, expect, it } from 'vitest';
import {
  runSubprocess,
  SubprocessTimeoutError,
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

  it('fires onStdout live with each chunk, in addition to the buffered result', async () => {
    const chunks: string[] = [];
    const result = await runSubprocess(
      process.execPath,
      ['-e', 'process.stdout.write("hello-live")'],
      {
        cwd: process.cwd(),
        envVarName: 'CQP_TEST_TOOL_PATH',
        onStdout: (chunk) => chunks.push(chunk),
      },
    );

    expect(chunks.join('')).toBe('hello-live');
    expect(result.stdout).toBe('hello-live');
  });

  it('kills a subprocess that outlives timeoutMs and rejects with SubprocessTimeoutError (docs/adr/0045)', async () => {
    await expect(
      runSubprocess(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
        cwd: process.cwd(),
        envVarName: 'CQP_TEST_TOOL_PATH',
        timeoutMs: 200,
      }),
    ).rejects.toThrow(SubprocessTimeoutError);
  });

  it('carries whatever stdout/stderr had already been buffered before the timeout kill', async () => {
    // Confirmed live: a killed pytest batch used to lose its already-flowing
    // output entirely -- SubprocessTimeoutError took no stdout/stderr args,
    // so the buffered data (already delivered live to onStdout/onStderr)
    // was discarded on the reject path. This is the caller's only remaining
    // way to recover it once the subprocess is gone.
    await expect(
      runSubprocess(
        process.execPath,
        [
          '-e',
          'process.stdout.write("partial-before-kill"); process.stderr.write("partial-err"); setTimeout(() => {}, 60000)',
        ],
        {
          cwd: process.cwd(),
          envVarName: 'CQP_TEST_TOOL_PATH',
          timeoutMs: 200,
        },
      ),
    ).rejects.toMatchObject({
      stdout: 'partial-before-kill',
      stderr: 'partial-err',
    });
  });

  it('does not time out a subprocess that finishes well within timeoutMs', async () => {
    const result = await runSubprocess(process.execPath, ['--version'], {
      cwd: process.cwd(),
      envVarName: 'CQP_TEST_TOOL_PATH',
      timeoutMs: 10_000,
    });

    expect(result.exitCode).toBe(0);
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
