import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo } from '../api/hooks.js';
import { CodeQualitySecuritySection } from '../components/CodeQualitySecuritySection.js';
import { CoverageGateSection } from '../components/CoverageGateSection.js';
import { GenerateUnitTestsSection } from '../components/GenerateUnitTestsSection.js';
import { ModuleTabs, type RepoModule } from '../components/ModuleTabs.js';

export function RepoDetailPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const repoQuery = useRepo(repoId);
  const [activeModule, setActiveModule] = useState<RepoModule>('code-quality-security');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← All repos
      </Link>
      <h1 className="text-xl font-semibold">{repoQuery.data?.name ?? repoId}</h1>

      <ModuleTabs active={activeModule} onChange={setActiveModule} />

      {repoId && activeModule === 'code-quality-security' && (
        <CodeQualitySecuritySection repoId={repoId} />
      )}
      {repoId && activeModule === 'unit-testing' && (
        <>
          <CoverageGateSection repoId={repoId} defaultBranch={repoQuery.data?.defaultBranch} />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-600">
              Generate unit tests with Gemini (secondary)
            </summary>
            <div className="mt-3 space-y-6">
              <GenerateUnitTestsSection repoId={repoId} localPath={repoQuery.data?.localPath} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
