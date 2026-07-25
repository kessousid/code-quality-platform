import { useState } from 'react';

export type AppFeature = 'code-quality-security' | 'unit-testing' | 'cron-runner';

const FEATURES: { value: AppFeature; label: string }[] = [
  { value: 'code-quality-security', label: 'Code Quality & Security' },
  { value: 'unit-testing', label: 'Unit Testing' },
  { value: 'cron-runner', label: 'Cron Runner' },
];

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
          {FEATURES.map((feature) => (
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
    </div>
  );
}
