import { useState } from 'react';

/**
 * Set once per developer, reused on every future Gemini run from this
 * browser — same "remember it, don't ask again" reasoning as
 * DashboardPage's own LAST_WORKER_ID_KEY (docs/adr/0037): a developer who
 * hits the default key's quota shouldn't have to re-paste an override on
 * every single run.
 */
const SAVED_API_KEY_OVERRIDE_KEY = 'cqp:geminiApiKeyOverride';

export function readSavedGeminiApiKeyOverride(): string {
  return localStorage.getItem(SAVED_API_KEY_OVERRIDE_KEY) ?? '';
}

/**
 * Split out of GenerateUnitTestsSection to keep that component's own form
 * logic simple (see docs/adr/0037). Fully controlled — like every other
 * field in that form, the parent owns `value`/`onChange`; this component
 * only owns the transient "am I currently editing" UI state and the
 * localStorage read/write itself.
 */
export function GeminiApiKeyOverrideControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function save() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    localStorage.setItem(SAVED_API_KEY_OVERRIDE_KEY, trimmed);
    onChange(trimmed);
    setEditing(false);
    setDraft('');
  }

  function clear() {
    localStorage.removeItem(SAVED_API_KEY_OVERRIDE_KEY);
    onChange('');
    setEditing(false);
    setDraft('');
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Custom Gemini API key"
            className="min-w-64 flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={save}
            disabled={draft.trim().length === 0}
            className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft('');
            }}
            className="rounded border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Saved once on this browser, reused for every future Gemini run — for when the default key
          is out of quota.
        </p>
      </div>
    );
  }

  if (value.length > 0) {
    return (
      <p className="text-xs text-neutral-600">
        Using a saved Gemini API key override for this browser.{' '}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-blue-600 hover:underline"
        >
          Change
        </button>{' '}
        ·{' '}
        <button type="button" onClick={clear} className="text-blue-600 hover:underline">
          Clear
        </button>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded border px-3 py-2 text-sm hover:bg-neutral-50"
    >
      Set a custom Gemini API key (optional — for when the default key is out of quota)
    </button>
  );
}
