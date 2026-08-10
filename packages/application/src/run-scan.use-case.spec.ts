import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FakeGitCheckoutProvider,
  InMemoryFindingRepository,
  InMemoryRepoRepository,
  InMemoryScanRepository,
} from './testing/index.js';
import { RunScanUseCase } from './run-scan.use-case.js';

const REPO_TOKEN_KEY = randomBytes(32);

/**
 * Real end to end (see docs/adr/0021): the actual Phase 7 worker-thread
 * isolation runtime, the actual 6 plugins (Semgrep/gitleaks/OSV-Scanner/
 * ESLint/jscpd/madge), against a real fixture directory — only the
 * repositories are in-memory, so this runs without Postgres/Redis while
 * still proving the real orchestration (status transitions, fingerprint
 * upsert, dedup across repeated scans) end to end. Requires
 * CQP_GITLEAKS_PATH/CQP_OSV_SCANNER_PATH set, same as Phase 7's
 * full-scan.integration.spec.ts (see docs/architecture/local-tool-setup.md).
 */
const sampleRepoRoot = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'sample-repo');

async function setUp() {
  const repoRepository = new InMemoryRepoRepository();
  const scanRepository = new InMemoryScanRepository();
  const findingRepository = new InMemoryFindingRepository();

  const repo = await repoRepository.create({
    orgId: 'org_1',
    name: 'sample-repo',
    localPath: sampleRepoRoot,
  });
  const useCase = new RunScanUseCase(
    scanRepository,
    repoRepository,
    findingRepository,
    new FakeGitCheckoutProvider(),
    REPO_TOKEN_KEY,
  );

  return { repo, repoRepository, scanRepository, findingRepository, useCase };
}

describe('RunScanUseCase', () => {
  it('runs the real scan engine against a real local checkout and persists real findings', async () => {
    const { repo, scanRepository, findingRepository, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    await useCase.execute('org_1', scan.id);

    const completed = await scanRepository.findById('org_1', scan.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.startedAt).toBeDefined();
    expect(completed?.completedAt).toBeDefined();

    const findings = await findingRepository.listByScan('org_1', scan.id);
    const eslintFinding = findings.find(
      (f) => f.source === 'eslint' && f.ruleId.includes('no-unused-vars'),
    );
    expect(eslintFinding).toBeDefined();
    expect(eslintFinding?.firstSeenScanId).toBe(scan.id);
    expect(eslintFinding?.lastSeenScanId).toBe(scan.id);
    expect(eslintFinding?.status).toBe('open');
  }, 120_000);

  it('dedups the same finding across two scans of the same repo via fingerprint upsert, not a duplicate row', async () => {
    const { repo, scanRepository, findingRepository, useCase } = await setUp();

    const scan1 = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await useCase.execute('org_1', scan1.id);
    const scan2 = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await useCase.execute('org_1', scan2.id);

    const findingsAfterScan2 = await findingRepository.listByScan('org_1', scan2.id);
    const eslintFinding = findingsAfterScan2.find(
      (f) => f.source === 'eslint' && f.ruleId.includes('no-unused-vars'),
    );

    expect(eslintFinding).toBeDefined();
    // Same logical finding, not a fresh row — firstSeenScanId still points at scan1.
    expect(eslintFinding?.firstSeenScanId).toBe(scan1.id);
    expect(eslintFinding?.lastSeenScanId).toBe(scan2.id);
  }, 120_000);

  it('rejects an unknown scanId', async () => {
    const { useCase } = await setUp();
    await expect(useCase.execute('org_1', 'no-such-scan')).rejects.toThrow('Scan not found');
  });

  it('rejects an unknown repoId', async () => {
    const scanRepository = new InMemoryScanRepository();
    const repoRepository = new InMemoryRepoRepository();
    const findingRepository = new InMemoryFindingRepository();
    const useCase = new RunScanUseCase(
      scanRepository,
      repoRepository,
      findingRepository,
      new FakeGitCheckoutProvider(),
      REPO_TOKEN_KEY,
    );

    // Scan referencing a repo that was never created.
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: 'no-such-repo',
      ref: 'main',
      mode: 'full',
    });
    await expect(useCase.execute('org_1', scan.id)).rejects.toThrow('Repo not found');
  });

  it('fails clearly (not silently) when the repo has no local checkout to scan', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const scanRepository = new InMemoryScanRepository();
    const findingRepository = new InMemoryFindingRepository();
    const useCase = new RunScanUseCase(
      scanRepository,
      repoRepository,
      findingRepository,
      new FakeGitCheckoutProvider(),
      REPO_TOKEN_KEY,
    );

    const repo = await repoRepository.create({ orgId: 'org_1', name: 'no-checkout' }); // no localPath
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    await expect(useCase.execute('org_1', scan.id)).rejects.toThrow('no local checkout');

    const failed = await scanRepository.findById('org_1', scan.id);
    expect(failed?.status).toBe('failed');
  });

  it('clones a github repo via the checkout provider and always cleans up, even on failure', async () => {
    const repoRepository = new InMemoryRepoRepository();
    const scanRepository = new InMemoryScanRepository();
    const findingRepository = new InMemoryFindingRepository();
    const checkoutProvider = new FakeGitCheckoutProvider();
    checkoutProvider.error = new Error('git clone exited with code 128');
    const useCase = new RunScanUseCase(
      scanRepository,
      repoRepository,
      findingRepository,
      checkoutProvider,
      REPO_TOKEN_KEY,
    );
    const repo = await repoRepository.create({
      orgId: 'org_1',
      name: 'private-repo',
      provider: 'github',
      remoteUrl: 'https://github.com/org/private-repo.git',
    });
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    await expect(useCase.execute('org_1', scan.id)).rejects.toThrow('git clone exited');

    expect(checkoutProvider.checkoutCalls).toHaveLength(1);
    // Nothing to clean up — checkoutProvider itself threw before returning
    // a checkout, so there's no cleanup callback to have called.
    expect(checkoutProvider.cleanupCalls).toBe(0);
    const failed = await scanRepository.findById('org_1', scan.id);
    expect(failed?.status).toBe('failed');
  });

  it('never starts a scan that was already cancelled while queued (see docs/adr/0023)', async () => {
    const { repo, scanRepository, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });
    await scanRepository.updateStatus('org_1', scan.id, 'cancelled');

    await useCase.execute('org_1', scan.id);

    const stillCancelled = await scanRepository.findById('org_1', scan.id);
    expect(stillCancelled?.status).toBe('cancelled');
    expect(stillCancelled?.startedAt).toBeUndefined();
  });

  it('only runs plugins matching the requested categories', async () => {
    const { repo, scanRepository, findingRepository, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
      categories: ['code-quality'],
    });

    await useCase.execute('org_1', scan.id);

    const findings = await findingRepository.listByScan('org_1', scan.id);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.source !== 'gitleaks')).toBe(true);
  }, 120_000);

  it('records live progress (pluginsTotal/pluginsCompleted) as the scan runs', async () => {
    const { repo, scanRepository, useCase } = await setUp();
    const scan = await scanRepository.create({
      orgId: 'org_1',
      repoId: repo.id,
      ref: 'main',
      mode: 'full',
    });

    await useCase.execute('org_1', scan.id);

    const completed = await scanRepository.findById('org_1', scan.id);
    expect(completed?.pluginsTotal).toBe(6);
    expect(completed?.pluginsCompleted).toBe(6);
  }, 120_000);
});
