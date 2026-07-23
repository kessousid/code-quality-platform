import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TestGeneratorType } from '@cqp/core';
import { useCreateUnitTestRun, useUnitTestRuns } from '../api/hooks.js';
import { formatTargetPath } from '../lib/format-target-path.js';
import { DirectoryBrowser } from './DirectoryBrowser.js';

interface GenerateUnitTestsSectionProps {
  repoId: string;
  localPath: string | undefined;
}

/** Split out of RepoDetailPage to keep that component's own branching simple (see docs/adr/0024, docs/adr/0026). */
export function GenerateUnitTestsSection({ repoId, localPath }: GenerateUnitTestsSectionProps) {
  const unitTestRunsQuery = useUnitTestRuns(repoId);
  const createUnitTestRun = useCreateUnitTestRun();
  const [targetPath, setTargetPath] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [browsingTarget, setBrowsingTarget] = useState(false);
  const [generator, setGenerator] = useState<TestGeneratorType>('gemini');

  // Browsing shows the real, recognizable absolute path in the field (never a cryptic '.' or a blank-looking
  // empty string) — converting down to a path relative to the repo root only matters at submit time, which is
  // exactly where the API needs it, so that's where it happens.
  function toRepoRelativeTarget(path: string): string {
    if (!localPath) return path;
    if (path === localPath) return '.';
    return path.startsWith(localPath) ? path.slice(localPath.length).replace(/^[/\\]/, '') : path;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const target = toRepoRelativeTarget(targetPath.trim());
    if (target.length === 0) return;
    try {
      await createUnitTestRun.mutateAsync({
        repoId,
        target: {
          path: target,
          ...(functionName.trim().length > 0 ? { functionName: functionName.trim() } : {}),
        },
        generator,
      });
    } catch {
      // surfaced via createUnitTestRun.isError, if the UI grows one
    }
  }

  function handleBrowseSelect(absolutePath: string) {
    setTargetPath(absolutePath);
    setBrowsingTarget(false);
  }

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-600">Generate unit tests</h2>
        <p className="text-xs text-neutral-500">
          Pick a file or folder — writes real Jest test cases for its exported functions, then they
          run for real and the results show up below.
        </p>
        <form onSubmit={handleCreate} className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="Target file or folder (relative to the repo root)"
              className="min-w-64 flex-1 rounded border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setBrowsingTarget((b) => !b)}
              className="rounded border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Browse…
            </button>
          </div>
          {browsingTarget && (
            <DirectoryBrowser
              includeFiles
              {...(localPath ? { initialPath: localPath } : {})}
              onSelect={handleBrowseSelect}
              onClose={() => setBrowsingTarget(false)}
            />
          )}
          <input
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            placeholder="Specific function name (optional — only valid when the target above is a single file)"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="sr-only">Test generator</legend>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="generator"
                value="gemini"
                checked={generator === 'gemini'}
                onChange={() => setGenerator('gemini')}
              />
              Gemini (AI-written)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="generator"
                value="script"
                checked={generator === 'script'}
                onChange={() => setGenerator('script')}
              />
              Script-based (deterministic, no AI)
            </label>
          </fieldset>
          <button
            type="submit"
            disabled={createUnitTestRun.isPending || targetPath.trim().length === 0}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Generate &amp; run
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">Unit test runs</h2>
        {unitTestRunsQuery.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
        {unitTestRunsQuery.data && unitTestRunsQuery.data.data.length === 0 && (
          <p className="text-sm text-neutral-500">No unit test runs yet.</p>
        )}
        <ul className="divide-y rounded-lg border">
          {unitTestRunsQuery.data?.data.map((run) => (
            <li key={run.id} className="flex items-center justify-between p-3">
              <Link to={`/unit-tests/${run.id}`} className="text-blue-600 hover:underline">
                {formatTargetPath(run.target.path)}
                {run.target.functionName ? ` :: ${run.target.functionName}` : ''}
              </Link>
              <span className="text-xs text-neutral-500">
                ({run.generator}) {run.status}
                {run.status === 'running' && run.filesTotal !== undefined && (
                  <>
                    {' '}
                    ({run.filesCompleted ?? 0}/{run.filesTotal})
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
