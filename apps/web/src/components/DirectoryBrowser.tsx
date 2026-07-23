import { useState } from 'react';
import { useBrowseDirectory } from '../api/hooks.js';

interface DirectoryBrowserProps {
  initialPath?: string;
  /** Also list files, not just directories — needed to pick a single-file unit-test target (see docs/adr/0024). Clicking a file selects it immediately; clicking a directory navigates into it. */
  includeFiles?: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/** Inline folder/file picker (see docs/adr/0023, docs/adr/0024) — browses the machine the API/worker run on, since there's no clone-from-remote yet (ADR-0003). */
export function DirectoryBrowser({
  initialPath,
  includeFiles = false,
  onSelect,
  onClose,
}: DirectoryBrowserProps) {
  const [path, setPath] = useState(initialPath);
  const browseQuery = useBrowseDirectory(path, includeFiles);

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <code className="truncate text-xs text-neutral-600">
          {browseQuery.data?.path ?? path ?? 'Loading…'}
        </code>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 hover:underline"
        >
          Close
        </button>
      </div>

      {browseQuery.isError && (
        <p className="mb-2 text-xs text-red-600">
          Could not read that folder. Try a different path.
        </p>
      )}

      <ul className="max-h-56 divide-y overflow-y-auto rounded border text-sm">
        {browseQuery.data?.parent && (
          <li>
            <button
              type="button"
              onClick={() => setPath(browseQuery.data!.parent!)}
              className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
            >
              .. (up)
            </button>
          </li>
        )}
        {browseQuery.data?.entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() =>
                entry.type === 'directory' ? setPath(entry.path) : onSelect(entry.path)
              }
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left hover:bg-neutral-50"
            >
              {entry.type === 'directory' ? '📁' : '📄'} {entry.name}
            </button>
          </li>
        ))}
        {browseQuery.data && browseQuery.data.entries.length === 0 && (
          <li className="px-3 py-1.5 text-xs text-neutral-400">Nothing here.</li>
        )}
      </ul>

      <button
        type="button"
        disabled={!browseQuery.data}
        onClick={() => browseQuery.data && onSelect(browseQuery.data.path)}
        className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Use this folder
      </button>
    </div>
  );
}
