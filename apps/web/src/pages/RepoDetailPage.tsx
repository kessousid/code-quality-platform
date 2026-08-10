import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo, useUpdateRepoAccessToken } from '../api/hooks.js';
import { CodeQualitySecuritySection } from '../components/CodeQualitySecuritySection.js';
import { CoverageGateSection } from '../components/CoverageGateSection.js';
import { GenerateUnitTestsSection } from '../components/GenerateUnitTestsSection.js';
import { ModuleTabs, type RepoModule } from '../components/ModuleTabs.js';
import type { AppFeature } from '../components/FeatureSelector.js';

interface RepoDetailPageProps {
  /** When set to one of the two repo-scoped features, only that section renders — no tab switcher. Unset (e.g. a direct deep link) falls back to the original both-tabs behavior. */
  feature?: AppFeature;
  onChangeFeature?: () => void;
}

export function RepoDetailPage({ feature, onChangeFeature }: RepoDetailPageProps = {}) {
  const { repoId } = useParams<{ repoId: string }>();
  const repoQuery = useRepo(repoId);
  const restrictedModule =
    feature === 'code-quality-security' || feature === 'unit-testing' ? feature : undefined;
  const [activeModule, setActiveModule] = useState<RepoModule>(
    restrictedModule ?? 'code-quality-security',
  );
  const shownModule = restrictedModule ?? activeModule;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← All repos
        </Link>
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
      <h1 className="text-xl font-semibold">{repoQuery.data?.name ?? repoId}</h1>

      {repoId && repoQuery.data && repoQuery.data.provider !== 'local' && (
        <UpdateAccessTokenSection repoId={repoId} />
      )}

      {!restrictedModule && <ModuleTabs active={activeModule} onChange={setActiveModule} />}

      {repoId && shownModule === 'code-quality-security' && (
        <CodeQualitySecuritySection repoId={repoId} />
      )}
      {repoId && shownModule === 'unit-testing' && (
        <>
          <CoverageGateSection repoId={repoId} defaultBranch={repoQuery.data?.defaultBranch} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-600">
              Generate unit tests (secondary)
            </summary>
            <div className="mt-3 space-y-6">
              <GenerateUnitTestsSection
                repoId={repoId}
                localPath={repoQuery.data?.localPath}
                workerId={repoQuery.data?.workerId}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** Rotates or clears a github/gitlab repo's PAT (docs/adr/0047) — the token itself is never fetched back from the API, only ever written. */
function UpdateAccessTokenSection({ repoId }: { repoId: string }) {
  const [accessToken, setAccessToken] = useState('');
  const updateAccessToken = useUpdateRepoAccessToken(repoId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (accessToken.trim().length === 0) return;
    try {
      await updateAccessToken.mutateAsync(accessToken.trim());
    } catch {
      return; // surfaced via updateAccessToken.isError below
    }
    setAccessToken('');
  }

  async function handleClear() {
    try {
      await updateAccessToken.mutateAsync(null);
    } catch {
      return; // surfaced via updateAccessToken.isError below
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Access token</p>
      <div className="flex gap-2">
        <input
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="New Personal Access Token"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={updateAccessToken.isPending || accessToken.trim().length === 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={updateAccessToken.isPending}
          className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      {updateAccessToken.isError && (
        <p className="text-xs text-red-600">Failed to update the access token.</p>
      )}
      {updateAccessToken.isSuccess && (
        <p className="text-xs text-green-600">Access token updated.</p>
      )}
    </form>
  );
}
