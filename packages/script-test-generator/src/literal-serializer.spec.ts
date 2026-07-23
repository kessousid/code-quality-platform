import { describe, expect, it } from 'vitest';
import { serializeValueToLiteral } from './literal-serializer.js';

describe('serializeValueToLiteral', () => {
  it('distinguishes -0 from 0 — the exact case JSON.stringify collapses and an LLM guessed wrong', () => {
    expect(serializeValueToLiteral(-0)).toBe('-0');
    expect(serializeValueToLiteral(0)).toBe('0');
  });

  it('handles NaN and Infinity, which JSON.stringify turns into null', () => {
    expect(serializeValueToLiteral(NaN)).toBe('NaN');
    expect(serializeValueToLiteral(Infinity)).toBe('Infinity');
    expect(serializeValueToLiteral(-Infinity)).toBe('-Infinity');
  });

  it('handles undefined, which JSON.stringify drops entirely', () => {
    expect(serializeValueToLiteral(undefined)).toBe('undefined');
  });

  it('serializes primitives, arrays, and plain objects', () => {
    expect(serializeValueToLiteral('hello')).toBe('"hello"');
    expect(serializeValueToLiteral(true)).toBe('true');
    expect(serializeValueToLiteral(null)).toBe('null');
    expect(serializeValueToLiteral([1, 2, 3])).toBe('[1, 2, 3]');
    expect(serializeValueToLiteral({ a: 1, b: 'x' })).toBe('{ "a": 1, "b": "x" }');
  });

  it('returns null for values it cannot safely serialize (functions), triggering the smoke fallback', () => {
    expect(serializeValueToLiteral(() => {})).toBeNull();
    expect(serializeValueToLiteral({ fn: () => {} })).toBeNull();
  });

  it('returns null for a circular reference instead of infinite-looping', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeValueToLiteral(circular)).toBeNull();
  });
});
