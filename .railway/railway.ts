import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac';

export default defineRailway(() => {
  const codeQualityPlatform = github('kessousid/code-quality-platform');

  const Redis = redis('Redis');
  const Postgres = postgres('Postgres');
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });
  const qaAutomation = service('qa-automation', {
    source: codeQualityPlatform,
    replicas: { 'us-east4-eqdc4a': 1 },
    env: {
      ADMIN_EMAIL: preserve(),
      ADMIN_PASSWORD: preserve(),
      ALERT_EMAIL_APP_PASSWORD: preserve(),
      ALERT_EMAIL_CC: preserve(),
      ALERT_EMAIL_FROM: preserve(),
      ALERT_EMAIL_TO: preserve(),
      APP_BASE_URL: preserve(),
      BASE_URL: preserve(),
      CANDIDATE_EMAIL: preserve(),
      CANDIDATE_PASSWORD: preserve(),
      COACH_EMAIL: preserve(),
      COACH_PASSWORD: preserve(),
      DATABASE_URL: preserve(),
      EMPLOYER_EMAIL: preserve(),
      EMPLOYER_PASSWORD: preserve(),
      INTERNAL_RECRUITER_EMAIL: preserve(),
      INTERNAL_RECRUITER_PASSWORD: preserve(),
      INTERVIEWER_EMAIL: preserve(),
      INTERVIEWER_PASSWORD: preserve(),
      MASTER_RECRUITER_EMAIL: preserve(),
      MASTER_RECRUITER_PASSWORD: preserve(),
      MENTOR_EMAIL: preserve(),
      MENTOR_PASSWORD: preserve(),
      PANEL_ADMIN_EMAIL: preserve(),
      PANEL_ADMIN_PASSWORD: preserve(),
      PORTAL_QA_EMAIL: preserve(),
      PORTAL_QA_PASSWORD: preserve(),
      PORTAL_QA_SLOT_CHECK_EMAIL: preserve(),
      PORTAL_QA_SLOT_CHECK_PASSWORD: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      REDIS_URL: preserve(),
      SCHEDULING_ADMIN_EMAIL: preserve(),
      SCHEDULING_ADMIN_PASSWORD: preserve(),
      STAGING_TESTS_GIT_TOKEN: preserve(),
      STAGING_TESTS_REPO_URL: preserve(),
    },
    build: {
      watchPatterns: [
        'apps/qa-automation/**',
        'packages/core/**',
        'packages/db/**',
        'packages/application/**',
        'packages/queue/**',
        'packages/qa-automation-tests/**',
        'packages/staging-test-runner/**',
        'packages/email/**',
        'packages/reporting/**',
        'pnpm-lock.yaml',
      ],
    },
  });
  const api = service('api', {
    source: codeQualityPlatform,
    replicas: { 'us-east4-eqdc4a': 1 },
    build: {
      watchPatterns: [
        'apps/api/**',
        'packages/core/**',
        'packages/db/**',
        'packages/application/**',
        'packages/storage/**',
        'packages/reporting/**',
        'packages/queue/**',
        'packages/filesystem-browser/**',
        'packages/cron-client/**',
        'packages/email/**',
        'pnpm-lock.yaml',
      ],
    },
    env: {
      ALERT_EMAIL_APP_PASSWORD: preserve(),
      ALERT_EMAIL_FROM: preserve(),
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      REDIS_URL: preserve(),
      REPO_TOKEN_ENCRYPTION_KEY: preserve(),
      WEB_BASE_URL: preserve(),
    },
  });
  const web = service('web', {
    source: codeQualityPlatform,
    replicas: { 'us-east4-eqdc4a': 1 },
    build: {
      watchPatterns: ['apps/web/**', 'packages/core/**', 'packages/reporting/**', 'pnpm-lock.yaml'],
    },
    env: {
      API_INTERNAL_URL: preserve(),
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  });
  const worker = service('worker', {
    source: codeQualityPlatform,
    replicas: { 'us-west2': 1 },
    build: {
      watchPatterns: [
        'apps/worker/**',
        'packages/core/**',
        'packages/db/**',
        'packages/application/**',
        'packages/queue/**',
        'packages/filesystem-browser/**',
        'packages/git-checkout/**',
        'packages/gemini-test-generator/**',
        'packages/script-test-generator/**',
        'packages/scan-engine/**',
        'packages/unit-test-engine/**',
        'packages/coverage-engine/**',
        'packages/enrichment/**',
        'packages/correlation/**',
        'packages/plugin-runtime/**',
        'packages/plugins/semgrep/**',
        'packages/plugins/gitleaks/**',
        'packages/plugins/osv-scanner/**',
        'packages/plugins/eslint/**',
        'packages/plugins/jscpd/**',
        'packages/plugins/dependency-graph/**',
        'packages/plugins/shared/**',
        'pnpm-lock.yaml',
      ],
    },
    env: {
      DATABASE_URL: preserve(),
      GEMINI_API_KEY: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      REDIS_URL: preserve(),
      REPO_TOKEN_ENCRYPTION_KEY: preserve(),
    },
  });

  return project('code-quality-platform', {
    resources: [qaAutomation, api, web, Redis, worker, Postgres, postgresVolume, redisVolume],
  });
});
