import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo } from '../api/hooks.js';
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

      {!restrictedModule && <ModuleTabs active={activeModule} onChange={setActiveModule} />}

      {repoId && shownModule === 'code-quality-security' && (
        <CodeQualitySecuritySection repoId={repoId} />
      )}
      {repoId && shownModule === 'unit-testing' && (
        <>
          <CoverageGateSection repoId={repoId} defaultBranch={repoQuery.data?.defaultBranch} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-600">
              Generate unit tests with Gemini (secondary)
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
