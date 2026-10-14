/* eslint-disable @typescript-eslint/no-require-imports -- exercise the real query with a mocked Prisma client. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourceRoot = process.env.ASSIGNABLE_TEACHERS_SOURCE_ROOT || path.join(__dirname, '..');

function load(relativePath, mocks) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(name) { return mocks[name] ?? (name === 'server-only' ? {} : require(name)); },
    Date,
    Promise,
  }, { filename: relativePath });
  return exports;
}

test('admin instructor candidates include ordinary, teacher and legacy-null roles but exclude admins', async () => {
  let query;
  const accounts = [
    { id: 'student-user', name: 'Ada', email: 'ada@example.test', role: 'user' },
    { id: 'teacher', name: 'Grace', email: 'grace@example.test', role: 'teacher' },
    { id: 'legacy-user', name: 'Linus', email: 'linus@example.test', role: null },
    { id: 'admin', name: 'Root', email: 'root@example.test', role: 'admin' },
  ];
  const prisma = {
    user: {
      async findMany(args) {
        query = args;
        return accounts.filter((account) => args.where.OR.some((condition) => account.role === condition.role));
      },
    },
  };
  const data = load('app/data/teacher/get-course-gradebook.ts', {
    'server-only': {},
    './require-course-teacher': { requireCourseTeacher: async () => ({}) },
    './require-teacher': { requireTeacher: async () => ({ user: { id: 'admin', role: 'admin' } }) },
    '@/lib/prisma': prisma,
    '@/lib/teacher/deadline': { isSubmissionLate: () => false },
  });

  const candidates = await data.getAssignableTeachers();

  assert.deepEqual(
    Array.from(query.where.OR, (condition) => condition.role ?? '<null>').sort(),
    ['<null>', 'teacher', 'user'],
  );
  assert.deepEqual(Array.from(candidates, (account) => account.id), ['student-user', 'teacher', 'legacy-user']);
  assert.equal(candidates.some((account) => account.role === 'admin'), false);
});
