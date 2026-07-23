export type RepoModule = 'code-quality-security' | 'unit-testing';

interface ModuleTabsProps {
  active: RepoModule;
  onChange: (module: RepoModule) => void;
}

const TABS: { value: RepoModule; label: string; description: string }[] = [
  {
    value: 'code-quality-security',
    label: 'Code Quality & Security',
    description: 'Scan for issues — Semgrep, ESLint, jscpd, gitleaks, OSV-Scanner, madge',
  },
  {
    value: 'unit-testing',
    label: 'Unit Testing',
    description:
      'Ensure every changed line has a developer-written test — optionally generate new ones with Gemini',
  },
];

/** Two clearly separate modules, not one blended page — see the repo's own request for this split. */
export function ModuleTabs({ active, onChange }: ModuleTabsProps) {
  return (
    <div className="flex gap-2 border-b">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          title={tab.description}
          className={
            active === tab.value
              ? 'border-b-2 border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600'
              : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700'
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
