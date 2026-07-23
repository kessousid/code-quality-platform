import ts from 'typescript';
import type { FunctionSignature, SourceLanguage } from '@cqp/core';

export class FunctionNotFoundError extends Error {
  constructor(functionName: string, filePath: string) {
    super(`Exported function "${functionName}" not found in ${filePath}`);
    this.name = 'FunctionNotFoundError';
  }
}

export function languageFromPath(filePath: string): SourceLanguage {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'ts';
  if (filePath.endsWith('.jsx')) return 'jsx';
  return 'js';
}

function scriptKindFor(language: SourceLanguage): ts.ScriptKind {
  switch (language) {
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'jsx':
      return ts.ScriptKind.JSX;
    case 'ts':
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.JS;
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function isAsyncCallable(node: ts.Node): boolean {
  return (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
    hasModifier(node, ts.SyntaxKind.AsyncKeyword)
  );
}

/** Parameter names as written — a destructured param (`{ id, name }`) is captured as one opaque entry, not expanded. Used by the deterministic script generator (docs/adr/0026) to synthesize call arguments; the LLM generator ignores this. */
function parameterNamesOf(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  if (
    !ts.isArrowFunction(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isFunctionDeclaration(node)
  ) {
    return [];
  }
  return node.parameters.map((p) => p.name.getText(sourceFile));
}

/**
 * What counts as "a function" for a given expression: a direct arrow/
 * function expression, or one wrapped by a higher-order call —
 * `const createUser = catchAsync(async (req, res) => {...})` is an
 * extremely common real-world Express pattern (error-handling
 * middleware wrappers), and the wrapped callback is what actually needs
 * a test written around it.
 */
function callableIn(expr: ts.Expression): ts.Node | undefined {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    return expr.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
  }
  return undefined;
}

/** `exports` or `module.exports`, the two bases every CommonJS export shape is written against. */
function isModuleOrExportsBase(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr) && expr.text === 'exports') return true;
  return (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'module' &&
    expr.name.text === 'exports'
  );
}

interface LocalDeclaration {
  isAsync: boolean;
  sourceText: string;
  parameters: string[];
}

/**
 * Real TypeScript AST parsing (docs/adr/0024), not regex. Two families
 * of export syntax are recognized:
 *
 * - ESM: `export function foo() {}`, `export const foo = (...) => {}` /
 *   `= async (...) => {}` / `= function () {}`.
 * - CommonJS (added after a real target repo's controllers all used
 *   this and produced zero matches): `exports.foo = ...` /
 *   `module.exports.foo = ...` (direct assignment or a reference to a
 *   `const foo = ...` declared earlier), and `module.exports = { foo,
 *   bar: baz }` (the dominant real-world Express pattern — an object
 *   literal at the bottom of the file, referencing plain `const`
 *   declarations that carry no export keyword of their own).
 *
 * Exported classes/methods and anonymous `export default function () {}`
 * remain out of scope for v1 — the LLM needs a named, standalone
 * function to generate a meaningful test around.
 */
export function extractExportedFunctions(
  sourceCode: string,
  filePath: string,
  functionNameFilter?: string,
): FunctionSignature[] {
  const language = languageFromPath(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(language),
  );

  const localDeclarations = new Map<string, LocalDeclaration>();
  const exportedNameToLocalName = new Map<string, string>();
  const defaultExportNames = new Set<string>();

  ts.forEachChild(sourceFile, (node) => {
    handleFunctionDeclaration(
      node,
      sourceFile,
      localDeclarations,
      exportedNameToLocalName,
      defaultExportNames,
    );
    handleVariableStatement(node, sourceFile, localDeclarations, exportedNameToLocalName);
    handleCommonJsAssignment(
      node,
      sourceFile,
      localDeclarations,
      exportedNameToLocalName,
      defaultExportNames,
    );
  });

  const results: FunctionSignature[] = [];
  for (const [exportedName, localName] of exportedNameToLocalName) {
    const declaration = localDeclarations.get(localName);
    if (!declaration) continue;
    results.push({
      name: exportedName,
      isDefaultExport: defaultExportNames.has(exportedName) || defaultExportNames.has(localName),
      isAsync: declaration.isAsync,
      sourceText: declaration.sourceText,
      parameters: declaration.parameters,
    });
  }

  if (!functionNameFilter) {
    return results;
  }
  const filtered = results.filter((f) => f.name === functionNameFilter);
  if (filtered.length === 0) {
    throw new FunctionNotFoundError(functionNameFilter, filePath);
  }
  return filtered;
}

function handleFunctionDeclaration(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  localDeclarations: Map<string, LocalDeclaration>,
  exportedNameToLocalName: Map<string, string>,
  defaultExportNames: Set<string>,
): void {
  if (!ts.isFunctionDeclaration(node) || !node.name) return;

  localDeclarations.set(node.name.text, {
    isAsync: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
    sourceText: node.getText(sourceFile),
    parameters: parameterNamesOf(node, sourceFile),
  });
  if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
    exportedNameToLocalName.set(node.name.text, node.name.text);
    if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
      defaultExportNames.add(node.name.text);
    }
  }
}

function handleVariableStatement(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  localDeclarations: Map<string, LocalDeclaration>,
  exportedNameToLocalName: Map<string, string>,
): void {
  if (!ts.isVariableStatement(node)) return;
  const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);

  for (const decl of node.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
    const callable = callableIn(decl.initializer);
    if (!callable) continue;

    localDeclarations.set(decl.name.text, {
      isAsync: isAsyncCallable(callable),
      sourceText: node.getText(sourceFile),
      parameters: parameterNamesOf(callable, sourceFile),
    });
    if (isExported) {
      exportedNameToLocalName.set(decl.name.text, decl.name.text);
    }
  }
}

function handleCommonJsAssignment(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  localDeclarations: Map<string, LocalDeclaration>,
  exportedNameToLocalName: Map<string, string>,
  defaultExportNames: Set<string>,
): void {
  if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return;
  if (node.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  const { left, right } = node.expression;

  // exports.foo = ... / module.exports.foo = ...
  if (ts.isPropertyAccessExpression(left) && isModuleOrExportsBase(left.expression)) {
    const propertyName = left.name.text;
    const callable = callableIn(right);
    if (callable) {
      localDeclarations.set(propertyName, {
        isAsync: isAsyncCallable(callable),
        sourceText: node.getText(sourceFile),
        parameters: parameterNamesOf(callable, sourceFile),
      });
      exportedNameToLocalName.set(propertyName, propertyName);
    } else if (ts.isIdentifier(right)) {
      exportedNameToLocalName.set(propertyName, right.text);
    }
    return;
  }

  if (!isModuleOrExportsBase(left)) return;

  // module.exports = someIdentifier
  if (ts.isIdentifier(right)) {
    exportedNameToLocalName.set(right.text, right.text);
    defaultExportNames.add(right.text);
    return;
  }

  // module.exports = { foo, bar: baz, qux: () => {} }
  if (ts.isObjectLiteralExpression(right)) {
    handleModuleExportsObjectLiteral(right, sourceFile, localDeclarations, exportedNameToLocalName);
  }
}

function handleModuleExportsObjectLiteral(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  localDeclarations: Map<string, LocalDeclaration>,
  exportedNameToLocalName: Map<string, string>,
): void {
  for (const prop of objectLiteral.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) {
      exportedNameToLocalName.set(prop.name.text, prop.name.text);
      continue;
    }
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

    if (ts.isIdentifier(prop.initializer)) {
      exportedNameToLocalName.set(prop.name.text, prop.initializer.text);
      continue;
    }
    const callable = callableIn(prop.initializer);
    if (callable) {
      localDeclarations.set(prop.name.text, {
        isAsync: isAsyncCallable(callable),
        sourceText: prop.initializer.getText(sourceFile),
        parameters: parameterNamesOf(callable, sourceFile),
      });
      exportedNameToLocalName.set(prop.name.text, prop.name.text);
    }
  }
}
