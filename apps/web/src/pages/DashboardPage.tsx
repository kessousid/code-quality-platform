import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useCreateRepo, useRepos } from '../api/hooks.js';
import { DirectoryBrowser } from '../components/DirectoryBrowser.js';
import { FEATURE_LABELS, USER_GUIDE_URL, type AppFeature } from '../components/FeatureSelector.js';

/**
 * A developer's workerId is effectively constant across every repo they add
 * from this browser — remembering it avoids the trap where an empty field
 * silently falls back to 'default' (a shared/Railway worker, not this
 * machine) the moment Browse… is clicked (docs/adr/0032).
 */
const LAST_WORKER_ID_KEY = 'cqp:lastWorkerId';

export function DashboardPage({
  feature,
  onChangeFeature,
}: { feature?: AppFeature | null; onChangeFeature?: () => void } = {}) {
  const reposQuery = useRepos();
  const createRepo = useCreateRepo();
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [workerId, setWorkerId] = useState(() => localStorage.getItem(LAST_WORKER_ID_KEY) ?? '');
  const [browsing, setBrowsing] = useState(false);
  // 'On my computer' runs via your own local worker (docs/adr/0031);
  // 'On GitHub'/'On GitLab' skip a local folder entirely — Railway's own
  // worker clones it fresh at run time instead (docs/adr/0047) —
  // GitCloneCheckoutProvider only ever needs a raw git URL, so both
  // hosts share the exact same flow.
  const [source, setSource] = useState<'local' | 'github' | 'gitlab'>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');

  function handleWorkerIdChange(value: string) {
    setWorkerId(value);
    if (value.trim().length > 0) {
      localStorage.setItem(LAST_WORKER_ID_KEY, value.trim());
    } else {
      localStorage.removeItem(LAST_WORKER_ID_KEY);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0) return;
    if (source !== 'local' && remoteUrl.trim().length === 0) return;
    try {
      await createRepo.mutateAsync(
        source !== 'local'
          ? {
              name: name.trim(),
              provider: source,
              remoteUrl: remoteUrl.trim(),
              ...(accessToken.trim().length > 0 ? { accessToken: accessToken.trim() } : {}),
            }
          : {
              name: name.trim(),
              ...(localPath.trim().length > 0 ? { localPath: localPath.trim() } : {}),
              ...(workerId.trim().length > 0 ? { workerId: workerId.trim() } : {}),
            },
      );
    } catch {
      return; // surfaced via createRepo.isError below
    }
    setName('');
    setLocalPath('');
    setRemoteUrl('');
    setAccessToken('');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {feature ? FEATURE_LABELS[feature] : 'Code Quality & Security Assessment Platform'}
        </h1>
        {onChangeFeature && (
          <button
            type="button"
            onClick={onChangeFeature}
            className="text-sm text-blue-600 hover:underline"
          >
            Switch feature
          </button>
        )}
      </div>

      <form onSubmit={handleCreate} className="space-y-2">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New repo name"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createRepo.isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add repo
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral-600">Where does this code live?</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={source === 'local'} onChange={() => setSource('local')} />
            On my computer
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={source === 'github'}
              onChange={() => setSource('github')}
            />
            On GitHub
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={source === 'gitlab'}
              onChange={() => setSource('gitlab')}
            />
            On GitLab
          </label>
        </div>

        {source === 'local' ? (
          <>
            <div className="flex gap-2">
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="Local checkout path (e.g. a specific project folder, not a parent of many repos)"
                className="flex-1 rounded border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setBrowsing((b) => !b)}
                className="rounded border px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Browse…
              </button>
            </div>
            <input
              value={workerId}
              onChange={(e) => handleWorkerIdChange(e.target.value)}
              placeholder="Worker ID (optional — defaults to 'default'; set this to route jobs to a specific machine's worker)"
              className="w-full rounded border px-3 py-2 text-sm"
            />
            {workerId.trim().length === 0 && (
              <p className="text-xs text-amber-600">
                No Worker ID set — Browse… and any jobs for this repo will use the shared
                &quot;default&quot; worker, not this machine. Don&apos;t have a worker running yet?{' '}
                <a
                  href={USER_GUIDE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:no-underline"
                >
                  See the setup guide
                </a>
                .
              </p>
            )}
            {browsing && (
              <DirectoryBrowser
                {...(localPath.trim().length > 0 ? { initialPath: localPath } : {})}
                workerId={workerId.trim().length > 0 ? workerId.trim() : 'default'}
                onSelect={(path) => {
                  setLocalPath(path);
                  setBrowsing(false);
                }}
                onClose={() => setBrowsing(false)}
              />
            )}
          </>
        ) : (
          <>
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder={
                source === 'gitlab'
                  ? 'https://gitlab.com/org/repo.git'
                  : 'https://github.com/org/repo.git'
              }
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              type="password"
              autoComplete="off"
              placeholder="Personal Access Token (only needed for a private repo)"
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <p className="text-xs text-neutral-500">
              No folder or worker to set up — a Railway-hosted worker clones this repo fresh each
              time it runs. The token is encrypted at rest and never shown again after saving.
            </p>
          </>
        )}
        {createRepo.isError && (
          <p className="text-sm text-red-600">
            {createRepo.error instanceof ApiError
              ? createRepo.error.message
              : 'Failed to create the repo. Please try again.'}
          </p>
        )}
      </form>

      {reposQuery.isLoading && <p className="text-sm text-neutral-500">Loading repos…</p>}
      {reposQuery.isError && <p className="text-sm text-red-600">Failed to load repos.</p>}

      {reposQuery.data && reposQuery.data.data.length === 0 && (
        <p className="text-sm text-neutral-500">No repos yet — add one above to run a scan.</p>
      )}

      <ul className="space-y-2">
        {reposQuery.data?.data.map((repo) => (
          <li key={repo.id} className="rounded-lg border p-4 shadow-sm">
            <Link to={`/repos/${repo.id}`} className="font-medium text-blue-600 hover:underline">
              {repo.name}
            </Link>
            <div className="text-xs text-neutral-500">
              {repo.provider} &middot; default branch {repo.defaultBranch}
              {repo.provider === 'local' ? (
                <>
                  {' '}
                  &middot; worker {repo.workerId}
                  {repo.localPath ? (
                    <> &middot; {repo.localPath}</>
                  ) : (
                    <> &middot; no local checkout set</>
                  )}
                </>
              ) : (
                <> &middot; {repo.remoteUrl ?? 'no remote URL set'}</>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
