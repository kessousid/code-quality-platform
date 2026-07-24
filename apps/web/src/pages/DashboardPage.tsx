import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCreateRepo, useRepos } from '../api/hooks.js';
import { DirectoryBrowser } from '../components/DirectoryBrowser.js';

export function DashboardPage() {
  const reposQuery = useRepos();
  const createRepo = useCreateRepo();
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [browsing, setBrowsing] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0) return;
    try {
      await createRepo.mutateAsync({
        name: name.trim(),
        ...(localPath.trim().length > 0 ? { localPath: localPath.trim() } : {}),
        ...(workerId.trim().length > 0 ? { workerId: workerId.trim() } : {}),
      });
    } catch {
      return; // surfaced via createRepo.isError, if the UI grows one
    }
    setName('');
    setLocalPath('');
    setWorkerId('');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Code Quality &amp; Security Assessment Platform</h1>

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
          onChange={(e) => setWorkerId(e.target.value)}
          placeholder="Worker ID (optional — defaults to 'default'; set this to route jobs to a specific machine's worker)"
          className="w-full rounded border px-3 py-2 text-sm"
        />
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
              {repo.provider} &middot; default branch {repo.defaultBranch} &middot; worker{' '}
              {repo.workerId}
              {repo.localPath ? (
                <> &middot; {repo.localPath}</>
              ) : (
                <> &middot; no local checkout set</>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
