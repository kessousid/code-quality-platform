// Root ESLint flat config shared by all workspace packages.
// Individual packages may extend this with framework-specific rules
// (e.g. apps/web adds the React plugin).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // __fixtures__ directories hold deliberately-bad code that plugin
    // tests scan on purpose (Phase 7) — they are test input, not source
    // this repo's own quality bar applies to.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/__fixtures__/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      complexity: ['warn', 15],
      'max-lines-per-function': ['warn', 120],
      // See docs/adr/0007-orm-prisma.md — this platform's own scan target
      // has a real SQL-injection finding from unparameterized raw SQL.
      // $queryRawUnsafe/$executeRawUnsafe are banned outright; use the
      // tagged-template $queryRaw/$executeRaw, which auto-parameterizes.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(\\$queryRawUnsafe|\\$executeRawUnsafe)$/]',
          message:
            'Prisma $queryRawUnsafe/$executeRawUnsafe are banned (see docs/adr/0007-orm-prisma.md). Use the $queryRaw/$executeRaw tagged template instead.',
        },
      ],
    },
  },
);
