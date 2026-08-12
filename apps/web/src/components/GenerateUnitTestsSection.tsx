import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TestGeneratorType } from '@cqp/core';
import { useCreateUnitTestRun, useUnitTestRuns } from '../api/hooks.js';
import { formatTargetPath } from '../lib/format-target-path.js';
import { toRepoRelativeTarget } from '../lib/to-repo-relative-target.js';
import { DirectoryBrowser } from './DirectoryBrowser.js';
import {
  GeminiApiKeyOverrideControl,
  readSavedGeminiApiKeyOverride,
} from './GeminiApiKeyOverrideControl.js';

interface GenerateUnitTestsSectionProps {
  repoId: string;
  localPath: string | undefined;
  /** Which worker's filesystem to browse for a target (see docs/adr/0032) — this repo's own workerId, not necessarily 'default'. */
  workerId: string | undefined;
}

/** Split out of RepoDetailPage to keep that component's own branching simple (see docs/adr/0024, docs/adr/0026). */
export function GenerateUnitTestsSection({
  repoId,
  localPath,
  workerId,
}: GenerateUnitTestsSectionProps) {
  const unitTestRunsQuery = useUnitTestRuns(repoId);
  const createUnitTestRun = useCreateUnitTestRun();
  const [targetPath, setTargetPath] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [browsingTarget, setBrowsingTarget] = useState(false);
  const [generator, setGenerator] = useState<TestGeneratorType>('gemini');
  const [apiKeyOverride, setApiKeyOverride] = useState(() => readSavedGeminiApiKeyOverride());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const target = toRepoRelativeTarget(targetPath.trim(), localPath);
    if (target.length === 0) return;
    try {
      await createUnitTestRun.mutateAsync({
        repoId,
        target: {
          path: target,
          ...(functionName.trim().length > 0 ? { functionName: functionName.trim() } : {}),
        },
        generator,
        ...(generator === 'gemini' && apiKeyOverride.length > 0 ? { apiKeyOverride } : {}),
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
              {...(workerId ? { workerId } : {})}
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
          {generator === 'gemini' && (
            <GeminiApiKeyOverrideControl value={apiKeyOverride} onChange={setApiKeyOverride} />
          )}
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
