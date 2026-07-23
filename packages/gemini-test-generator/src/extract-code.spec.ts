import { describe, expect, it } from 'vitest';
import { extractCode } from './extract-code.js';

describe('extractCode', () => {
  it('returns the raw text unchanged when there is no fence', () => {
    expect(extractCode('describe("x", () => {});')).toBe('describe("x", () => {});\n');
  });

  it('strips a fence wrapping the entire response', () => {
    const raw = '```typescript\ndescribe("x", () => {});\n```';
    expect(extractCode(raw)).toBe('describe("x", () => {});\n');
  });

  it('strips a fence even with leading prose before it', () => {
    const raw = 'Here is the test file:\n\n```ts\ndescribe("x", () => {});\n```';
    expect(extractCode(raw)).toBe('describe("x", () => {});\n');
  });

  it('trims surrounding whitespace', () => {
    expect(extractCode('\n\n  describe("x", () => {});  \n\n')).toBe('describe("x", () => {});\n');
  });
});
