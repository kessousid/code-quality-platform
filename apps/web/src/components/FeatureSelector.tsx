import { useState } from 'react';

export type AppFeature = 'code-quality-security' | 'unit-testing' | 'cron-runner' | 'qa-automation';

/** Setup instructions for a new teammate — this tool only sees files on whichever machine runs a worker for that repo, so first use needs a one-time local setup step. */
export const USER_GUIDE_URL =
  'https://github.com/kessousid/code-quality-platform/blob/main/docs/user-guide.md';

const FEATURES: { value: AppFeature; label: string }[] = [
  { value: 'code-quality-security', label: 'Code Quality & Security' },
  { value: 'unit-testing', label: 'Unit Testing' },
  { value: 'cron-runner', label: 'Cron Runner' },
  { value: 'qa-automation', label: 'QA Automation' },
];

/**
 * Hidden from the picker for the time being, per the user — the feature
 * and its route (/crons) still exist and work for a direct link, this
 * only removes it from the initial "which feature?" choice.
 */
const HIDDEN_FEATURES = new Set<AppFeature>(['cron-runner']);
const VISIBLE_FEATURES = FEATURES.filter((f) => !HIDDEN_FEATURES.has(f.value));

/** Reused wherever a page needs to show which feature is active — e.g. DashboardPage's heading, which otherwise showed the same generic platform title no matter which feature was selected. */
export const FEATURE_LABELS: Record<AppFeature, string> = Object.fromEntries(
  FEATURES.map((f) => [f.value, f.label]),
) as Record<AppFeature, string>;

/**
 * The landing gate: nothing else renders until a feature is chosen, and
 * only that feature's functionality is shown afterward — not a
 * persisted preference, so it's asked again on every fresh visit.
 */
export function FeatureSelector({ onSelect }: { onSelect: (feature: AppFeature) => void }) {
  const [value, setValue] = useState<AppFeature | ''>('');

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Code Quality &amp; Security Assessment Platform</h1>
      <p className="text-sm text-neutral-600">Which feature would you like to use?</p>
      <div className="flex gap-2">
        <select
          aria-label="Feature"
          value={value}
          onChange={(e) => setValue(e.target.value as AppFeature)}
          className="flex-1 rounded border px-3 py-2 text-sm"
        >
          <option value="">Select a feature…</option>
          {VISIBLE_FEATURES.map((feature) => (
            <option key={feature.value} value={feature.value}>
              {feature.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={value === ''}
          onClick={() => value !== '' && onSelect(value)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        First time here?{' '}
        <a
          href={USER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          Read the setup guide
        </a>{' '}
        — Code Quality &amp; Security and Unit Testing need a worker running on your own machine
        before they can see your files.
      </p>
    </div>
  );
}
