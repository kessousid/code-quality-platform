import { describe, expect, it } from 'vitest';
import { extractExportedFunctions, FunctionNotFoundError } from './extract-functions.js';

describe('extractExportedFunctions', () => {
  it('finds an exported function declaration', () => {
    const source = `
      function helper() { return 1; }
      export function add(a: number, b: number): number {
        return a + b;
      }
    `;
    const result = extractExportedFunctions(source, 'math.ts');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('add');
    expect(result[0]?.isAsync).toBe(false);
    expect(result[0]?.sourceText).toContain('return a + b');
    expect(result[0]?.parameters).toEqual(['a', 'b']);
  });

  it('finds an exported async arrow function assigned to a const', () => {
    const source = `export const fetchUser = async (id: string) => {
      return { id };
    };`;
    const result = extractExportedFunctions(source, 'user.ts');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('fetchUser');
    expect(result[0]?.isAsync).toBe(true);
    expect(result[0]?.parameters).toEqual(['id']);
  });

  it('ignores non-exported functions', () => {
    const source = `function internal() { return 1; }`;
    expect(extractExportedFunctions(source, 'x.ts')).toHaveLength(0);
  });

  it('filters to a single named function when requested', () => {
    const source = `
      export function a() { return 1; }
      export function b() { return 2; }
    `;
    const result = extractExportedFunctions(source, 'x.ts', 'b');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('b');
  });

  it('throws a clear error when the requested function does not exist', () => {
    const source = `export function a() { return 1; }`;
    expect(() => extractExportedFunctions(source, 'x.ts', 'doesNotExist')).toThrow(
      FunctionNotFoundError,
    );
  });

  describe('CommonJS (real Express controller patterns)', () => {
    it('finds direct `exports.foo = function` assignments', () => {
      const source = `exports.add = function (a, b) { return a + b; };`;
      const result = extractExportedFunctions(source, 'math.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('add');
      expect(result[0]?.parameters).toEqual(['a', 'b']);
    });

    it('finds direct `module.exports.foo = (...) => {}` assignments', () => {
      const source = `module.exports.add = (a, b) => a + b;`;
      const result = extractExportedFunctions(source, 'math.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('add');
    });

    it('finds `module.exports = { foo, bar }` referencing plain consts with no export keyword of their own', () => {
      const source = `
        const createUser = async (req, res) => { res.send('ok'); };
        const getUser = (req, res) => { res.send('ok'); };
        module.exports = { createUser, getUser };
      `;
      const result = extractExportedFunctions(source, 'controller.js');
      expect(result.map((f) => f.name).sort()).toEqual(['createUser', 'getUser']);
      expect(result.find((f) => f.name === 'createUser')?.isAsync).toBe(true);
    });

    it('finds `module.exports = { key: renamedLocal }` and reports the exported name, not the local one', () => {
      const source = `
        const internalName = () => 1;
        module.exports = { publicName: internalName };
      `;
      const result = extractExportedFunctions(source, 'x.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('publicName');
    });

    it('finds functions wrapped in a higher-order call, e.g. `catchAsync(async (req, res) => {...})` (the real repo pattern that motivated this)', () => {
      const source = `
        const catchAsync = (fn) => fn;
        const createAssessment = catchAsync(async (req, res) => {
          res.send('ok');
        });
        module.exports = { createAssessment };
      `;
      const result = extractExportedFunctions(source, 'assessment.controller.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('createAssessment');
      expect(result[0]?.isAsync).toBe(true);
      expect(result[0]?.sourceText).toContain('catchAsync');
    });

    it('finds an inline function literal directly inside the module.exports object', () => {
      const source = `module.exports = { add: function (a, b) { return a + b; } };`;
      const result = extractExportedFunctions(source, 'math.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('add');
      expect(result[0]?.parameters).toEqual(['a', 'b']);
    });

    it('captures a destructured parameter as one opaque entry, not expanded', () => {
      const source = `exports.greet = function ({ name, greeting }) { return greeting + name; };`;
      const result = extractExportedFunctions(source, 'greet.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.parameters).toHaveLength(1);
      expect(result[0]?.parameters[0]).toContain('name');
      expect(result[0]?.parameters[0]).toContain('greeting');
    });

    it('finds `module.exports = identifier` as a default-like export', () => {
      const source = `
        function main() { return 1; }
        module.exports = main;
      `;
      const result = extractExportedFunctions(source, 'x.js');
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('main');
      expect(result[0]?.isDefaultExport).toBe(true);
    });

    it('ignores a plain const with no export anywhere', () => {
      const source = `const notExported = () => 1;`;
      expect(extractExportedFunctions(source, 'x.js')).toHaveLength(0);
    });
  });
});
