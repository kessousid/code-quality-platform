/**
 * Synthesizes one plausible argument per parameter, purely from its name
 * (see docs/adr/0026) — a deliberately simple heuristic, not an attempt
 * at real type inference. Good enough to get a real function call
 * happening; the golden-master step downstream is what makes the actual
 * assertion trustworthy, not this guess.
 */

const NUMBER_PATTERN =
  /^(a|b|c|x|y|z|n|i|j|k)$|num|count|amount|qty|quantity|age|len|length|size|index|idx|total|sum/i;
const STRING_PATTERN = /str|text|word|name|label|title|key|msg|message|email|url|path/i;
const BOOLEAN_PATTERN = /^(is|has|should|can)[A-Z_]|flag|enabled|active/i;
const ARRAY_PATTERN = /arr|list|items|values|elements/i;
const OBJECT_PATTERN = /obj|options|opts|config|params|data/i;

/** A destructured parameter (`{ id, name }` or `[a, b]`) is captured as one opaque string by extract-functions.ts — detect it so we pass a matching shape rather than a scalar. */
function looksDestructured(paramText: string): 'object' | 'array' | null {
  const trimmed = paramText.trim();
  if (trimmed.startsWith('{')) return 'object';
  if (trimmed.startsWith('[')) return 'array';
  return null;
}

function synthesizeOne(paramText: string, numericSeed: number): unknown {
  const destructured = looksDestructured(paramText);
  if (destructured === 'object') return {};
  if (destructured === 'array') return [];

  if (NUMBER_PATTERN.test(paramText)) return numericSeed;
  if (BOOLEAN_PATTERN.test(paramText)) return true;
  if (ARRAY_PATTERN.test(paramText)) return [];
  if (OBJECT_PATTERN.test(paramText)) return {};
  if (STRING_PATTERN.test(paramText)) return 'sample';

  return undefined;
}

/** One argument per parameter, in order. Successive numeric-looking parameters get distinct small values (2, 3, 4, ...) so e.g. `add(a, b)` doesn't degenerate into `add(2, 2)`. */
export function synthesizeArguments(parameters: string[]): unknown[] {
  let numericSeed = 2;
  return parameters.map((paramText) => {
    const value = synthesizeOne(paramText, numericSeed);
    if (typeof value === 'number') numericSeed += 1;
    return value;
  });
}
