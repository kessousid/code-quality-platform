import { spawn } from 'node:child_process';

export class ToolNotFoundError extends Error {
  constructor(command: string, envVarName: string) {
    super(`${command} not found — set ${envVarName} or install it on PATH`);
    this.name = 'ToolNotFoundError';
  }
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export class SubprocessTimeoutError extends Error {
  constructor(
    command: string,
    timeoutMs: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(`${command} did not exit within ${timeoutMs}ms and was killed as hung.`);
    this.name = 'SubprocessTimeoutError';
  }
}

/**
 * Real target-repo code frequently does DB/third-party-client setup at
 * module load time with no `.catch()` on the resulting promise (docs/adr/0028)
 * — since Node 15, an unhandled rejection crashes the whole process by
 * default, which was taking down the entire Jest run (and its JSON report)
 * over a failure in code the generated test never even calls directly.
 * `NODE_OPTIONS` is read by the Node runtime at process startup, before any
 * of the target repo's own code (including its own `.env`) runs — so this
 * can only be fixed from the *outside*, by the process that spawns `node`,
 * not by anything inside the target repo itself. Appends to (never
 * replaces) any `NODE_OPTIONS` already present, in case the environment
 * legitimately sets other flags.
 */
export function withUnhandledRejectionsAsWarnings(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const existing = baseEnv.NODE_OPTIONS?.trim();
  return {
    ...baseEnv,
    NODE_OPTIONS: [existing, '--unhandled-rejections=warn'].filter(Boolean).join(' '),
  };
}

/**
 * Shared by every plugin that shells out (Semgrep, gitleaks, OSV-Scanner —
 * see docs/adr/0017). Many of these tools exit non-zero when they find
 * something (that's the whole point), so a non-zero exit code is not
 * itself treated as failure here — only a failed spawn (ENOENT) is. Each
 * caller decides what its own tool's exit codes mean.
 */
export function runSubprocess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    envVarName: string;
    env?: NodeJS.ProcessEnv;
    /**
     * Fires alongside the usual buffering, for callers whose subprocess can
     * run long enough that silence looks indistinguishable from a hang —
     * confirmed as a real problem with the staging pytest suite (docs/adr/0044),
     * which could run for hours with zero output anywhere until the very
     * end. Never replaces the buffered stdout/stderr on the resolved
     * SubprocessResult — this is purely an additional live tap.
     */
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    /**
     * Kills the whole process tree and rejects with SubprocessTimeoutError
     * if the subprocess hasn't exited within this many ms (docs/adr/0045) —
     * live-confirmed necessary: two separate real staging runs each hung
     * for 2+ hours at the same point with zero output (even with stdout
     * unbuffered), and nothing else in this stack — not BullMQ's own
     * stall detection, which only watches whether *this* Node process
     * stays responsive, not whether a spawned child is actually making
     * progress — can ever recover from that. `detached: true` makes the
     * child its own process group leader so the negative-PID kill below
     * reaches every descendant (`xvfb-run` itself spawns Xvfb + the real
     * python process as children `child.kill()` alone would orphan, not
     * terminate).
     */
    timeoutMs?: number;
  },
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      ...(options.env ? { env: options.env } : {}),
      ...(options.timeoutMs !== undefined ? { detached: true } : {}),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            try {
              process.kill(-child.pid!, 'SIGKILL');
            } catch {
              child.kill('SIGKILL');
            }
          }, options.timeoutMs)
        : undefined;

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(new ToolNotFoundError(command, options.envVarName));
      } else {
        reject(error);
      }
    });

    child.on('close', (exitCode) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new SubprocessTimeoutError(command, options.timeoutMs!, stdout, stderr));
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}
