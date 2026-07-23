import { describe, expect, it } from 'vitest';
import { synthesizeArguments } from './argument-synthesizer.js';

describe('synthesizeArguments', () => {
  it('gives successive numeric-looking parameters distinct values, not the same one twice', () => {
    expect(synthesizeArguments(['a', 'b'])).toEqual([2, 3]);
  });

  it('recognizes string-, boolean-, array-, and object-sounding names', () => {
    expect(synthesizeArguments(['name'])).toEqual(['sample']);
    expect(synthesizeArguments(['isActive'])).toEqual([true]);
    expect(synthesizeArguments(['items'])).toEqual([[]]);
    expect(synthesizeArguments(['options'])).toEqual([{}]);
  });

  it('treats a destructured parameter as one opaque object/array argument', () => {
    expect(synthesizeArguments(['{ id, name }'])).toEqual([{}]);
    expect(synthesizeArguments(['[first, second]'])).toEqual([[]]);
  });

  it('falls back to undefined for a name it has no heuristic for', () => {
    expect(synthesizeArguments(['zzzUnrecognizable'])).toEqual([undefined]);
  });
});
