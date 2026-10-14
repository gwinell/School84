/* eslint-disable @typescript-eslint/no-require-imports -- inspect TSX module boundaries without booting the app. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.env.FEATURE_SOURCE_ROOT || path.join(__dirname, '..');
const teacherPages = [
  'app/teacher/page.tsx',
  'app/teacher/courses/[courseId]/page.tsx',
  'app/teacher/courses/[courseId]/edit/page.tsx',
  'app/teacher/courses/[courseId]/chapters/[chapterId]/page.tsx',
  'app/teacher/courses/[courseId]/chapters/[chapterId]/lessons/[lessonId]/page.tsx',
];

function parse(relativePath) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  return { source, filePath, ast: ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

function modulePath(fromFile, importPath) {
  const unresolved = importPath.startsWith('@/')
    ? path.join(root, importPath.slice(2))
    : path.resolve(path.dirname(fromFile), importPath);
  return ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((suffix) => `${unresolved}${suffix}`)
    .find((candidate) => fs.existsSync(candidate));
}

function hasDirective(source, directive) {
  const ast = ts.createSourceFile('directive.ts', source, ts.ScriptTarget.Latest, true);
  return ast.statements.some((statement) => ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression)
    && statement.expression.text === directive);
}

function importsByLocalName(ast) {
  const imports = new Map();
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imports.set(element.name.text, statement.moduleSpecifier.text);
    }
  }
  return imports;
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function callbackProps(ast, componentName) {
  const matches = [];
  walk(ast, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    if (!ts.isIdentifier(node.tagName) || node.tagName.text !== componentName) return;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !/^on[A-Z]/.test(attribute.name.getText())) continue;
      matches.push({ name: attribute.name.getText(), expression: attribute.initializer?.expression });
    }
  });
  return matches;
}

function assertServerActionCallbacks(pagePath, componentName) {
  const { ast, filePath } = parse(pagePath);
  const imports = importsByLocalName(ast);
  const callbacks = callbackProps(ast, componentName);
  assert.ok(callbacks.length, `${componentName} should receive its expected callbacks`);
  for (const callback of callbacks) {
    assert.ok(callback.expression && ts.isIdentifier(callback.expression),
      `${pagePath} passes ${callback.name} as a local function; only imported Server Actions can cross into a Client Component`);
    const importedFrom = imports.get(callback.expression.text);
    assert.ok(importedFrom, `${pagePath} callback ${callback.name} must reference an imported Server Action`);
    const actionFile = modulePath(filePath, importedFrom);
    assert.ok(actionFile, `Cannot resolve action module ${importedFrom} used by ${callback.name}`);
    const actionSource = fs.readFileSync(actionFile, 'utf8');
    assert.ok(hasDirective(actionSource, 'use server'),
      `${callback.name} must come from a module with a top-level "use server" directive`);
  }
}

test('teacher course roster passes Server Actions across the Client Component boundary', () => {
  assertServerActionCallbacks('app/teacher/courses/[courseId]/page.tsx', 'CourseRosterManager');
});

test('remaining teacher page client callbacks are imported Server Actions', () => {
  const boundaries = [
    ['app/teacher/courses/[courseId]/page.tsx', 'CourseInstructorsManager'],
    ['app/teacher/courses/[courseId]/page.tsx', 'CourseInvitationsList'],
    ['app/teacher/courses/[courseId]/page.tsx', 'CourseGradebook'],
  ];
  for (const [pagePath, componentName] of boundaries) assertServerActionCallbacks(pagePath, componentName);
});

test('teacher route source set stays covered when routes are added', () => {
  const routesOnDisk = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(target);
      else if (entry.name === 'page.tsx') routesOnDisk.push(path.relative(root, target));
    }
  }
  collect(path.join(root, 'app/teacher'));
  assert.deepEqual(routesOnDisk.sort(), [...teacherPages].sort(),
    'Update teacherPages and review client boundaries whenever a teacher route is added');
});
