/**
 * Serializes a real captured value into JavaScript source-code literal
 * text, for the golden-master assertion this generator writes (see
 * docs/adr/0026). Deliberately not `JSON.stringify` — it silently drops
 * `undefined`/functions, collapses `-0` into `0`, and turns `NaN`/
 * `Infinity` into `null`, which is exactly the class of value this
 * generator exists to get right (the bug that motivated it: `-0` vs `0`
 * under Jest's `.toBe()`/`Object.is`).
 *
 * Returns `null` for anything it can't safely represent (functions,
 * symbols, circular references) — the caller falls back to a smoke test
 * instead of a snapshot assertion in that case.
 */
export function serializeValueToLiteral(
  value: unknown,
  seen: Set<unknown> = new Set(),
): string | null {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'number') return serializeNumber(value as number);
  if (type === 'string') return JSON.stringify(value);
  if (type === 'boolean') return String(value);
  if (type === 'bigint') return `${value}n`;
  if (type === 'function' || type === 'symbol') return null;

  if (Array.isArray(value)) return serializeArray(value, seen);
  if (type === 'object') return serializeObject(value as Record<string, unknown>, seen);

  return null;
}

function serializeNumber(n: number): string {
  if (Object.is(n, -0)) return '-0';
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  return String(n);
}

function serializeArray(value: unknown[], seen: Set<unknown>): string | null {
  if (seen.has(value)) return null; // circular
  seen.add(value);
  const items: string[] = [];
  for (const item of value) {
    const serialized = serializeValueToLiteral(item, seen);
    if (serialized === null) return null;
    items.push(serialized);
  }
  return `[${items.join(', ')}]`;
}

function serializeObject(value: Record<string, unknown>, seen: Set<unknown>): string | null {
  if (seen.has(value)) return null; // circular
  seen.add(value);
  const entries: string[] = [];
  for (const [key, propValue] of Object.entries(value)) {
    const serialized = serializeValueToLiteral(propValue, seen);
    if (serialized === null) return null;
    entries.push(`${JSON.stringify(key)}: ${serialized}`);
  }
  return `{ ${entries.join(', ')} }`;
}
