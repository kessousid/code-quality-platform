import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import type { Linter } from 'eslint';

/**
 * This platform's own fixed baseline, applied uniformly to every scanned
 * repo — deliberately not the target repo's own ESLint config (which
 * could be lenient, disabled, or absent entirely). Consistency across
 * repos matters more here than respecting each repo's local preferences;
 * a repo with `no-unused-vars` turned off shouldn't score better than one
 * that enforces it. Non-type-checked typescript-eslint rules only — this
 * has to run against arbitrary repos without assuming a working tsconfig.
 */
// typescript-eslint's ConfigArray and eslint's own Linter.Config[] are both
// valid flat-config shapes at runtime; this cast only papers over the two
// packages independently declaring structurally-similar-but-not-identical
// types (their LanguageOptions differ by an index signature under
// exactOptionalPropertyTypes), not a real behavioral mismatch.
export const baselineConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Without this, no-undef false-positives on completely normal code —
    // `module`/`require` (Node) or `window`/`document` (browser) would
    // all look like undefined-variable errors in an otherwise clean repo.
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      complexity: ['warn', 15],
      'max-lines-per-function': ['warn', 120],
    },
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.git/**'],
  },
) as unknown as Linter.Config[];
