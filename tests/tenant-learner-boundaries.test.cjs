/* eslint-disable @typescript-eslint/no-require-imports -- node:test loads server actions in an isolated VM. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, user = { id: 'removed-member', role: 'user' }) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name === '@/app/data/user/require-user') return { requireUser: async () => ({ user }) };
      if (name === './require-user') return { requireUser: async () => ({ user }) };
      if (name === '@/lib/responses') return {
        errorResponse: (message, data) => ({ status: 'error', message, data }),
        successResponse: (message, data) => ({ status: 'success', message, data }),
      };
      if (name === 'next/cache') return { revalidatePath() {} };
      return require(name);
    },
    console, Date, Map, Set, Promise, AbortSignal,
  }, { filename: file });
  return exports;
}

const helperFile = 'app/data/user/course-learner-access.ts';
const quizFile = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/quiz-actions.ts';
const progressFile = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/cell-progress-actions.ts';
const cursorFile = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/learning-cursor-actions.ts';
const codeFile = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/code-submission-actions.ts';
const attemptsFile = 'app/data/user/get-my-quiz-attempts.ts';

function revokedMembershipDb(role) {
  const calls = { writes: 0, runner: 0 };
  const prisma = {
    organizationMembership: { findUnique: async () => null },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'ALL_AT_ONCE' }) },
    quizQuestion: { findUnique: async () => ({
      id: 'question',
      quiz: { lesson: { id: 'lesson', chapter: { courseId: 'course', course: { status: 'PUBLISHED', organizationId: 'school' } } }, cell: null },
      answers: [{ id: 'correct-answer', isCorrect: true, explanation: 'secret' }],
    }) },
    lessonCell: {
      findUnique: async () => ({ id: 'cell', lessonId: 'lesson', type: 'QUIZ', quiz: { questions: [{ id: 'question', text: 'Q', answers: [{ id: 'correct-answer', text: 'A', isCorrect: true }] }] }, lesson: { chapter: { course: { id: 'course', slug: 'course', status: 'PUBLISHED', organizationId: 'school' } } } }),
      findMany: async () => [{ id: 'cell' }],
    },
    lesson: { findUnique: async () => ({ id: 'lesson', chapter: { courseId: 'course', course: { slug: 'course', status: 'PUBLISHED', organizationId: 'school' } }, cells: [{ id: 'cell' }] }) },
    quizAttempt: { create: async () => { calls.writes++; } },
    lessonCellProgress: { upsert: async () => { calls.writes++; }, count: async () => 0 },
    lessonProgress: { upsert: async () => { calls.writes++; } },
    learningCursor: { upsert: async () => { calls.writes++; } },
    codeSubmission: { create: async () => { calls.writes++; } },
  };
  const access = load(helperFile, { '@/lib/prisma': prisma });
  const shared = { '@/lib/prisma': prisma, '@/app/data/user/course-learner-access': access };
  return {
    calls,
    role,
    quiz: load(quizFile, { ...shared, '@/lib/course-access': { canAccessAssignedLesson: async () => true } }, { id: 'removed-member', role }),
    progress: load(progressFile, { ...shared, '@/lib/course-access': { canAccessAssignedLesson: async () => true } }, { id: 'removed-member', role }),
    cursor: load(cursorFile, { ...shared, '@/lib/course-access': { canAccessAssignedLesson: async () => true } }, { id: 'removed-member', role }),
    code: load(codeFile, {
      ...shared,
      '@/lib/course-access': { canAccessAssignedLesson: async () => true },
      '@/lib/env': { env: {} },
    }, { id: 'removed-member', role }),
  };
}

test('removed teachers and admins with stale active enrollment cannot retrieve quiz answers or create attempts', async () => {
  for (const role of ['teacher', 'user']) {
    const s = revokedMembershipDb(role);
    const result = await s.quiz.gradeQuizAnswerAction({ questionId: 'question', selectedAnswerIds: ['correct-answer'] });
    assert.equal(result, null, `${role} should not get quiz grading response`);
    assert.equal(s.calls.writes, 0, `${role} should not write quiz attempts`);
  }
});

test('removed teachers and admins with stale active enrollment cannot mutate quiz, cursor, or code progress', async () => {
  for (const role of ['teacher', 'user']) {
    const s = revokedMembershipDb(role);
    const quizResult = await s.progress.passLessonCellAction({ cellId: 'cell', quizAnswers: { question: ['correct-answer'] } });
    assert.equal(quizResult.status, 'error');
    const cursorResult = await s.cursor.setLastVisitedLearningPosition({ courseId: 'course', lessonId: 'lesson', cellId: 'cell' });
    assert.equal(cursorResult.status, 'error');
    const codeResult = await s.code.submitCodeTaskAction({ cellId: 'cell', sourceCode: 'print(1)' });
    assert.equal(codeResult.status, 'error');
    assert.equal(s.calls.writes, 0, `${role} should not write learner state`);
  }
});

test('quiz history without a cell filter is scoped to current student memberships and active enrollments', async () => {
  let query;
  const reader = load(attemptsFile, {
    '@/lib/prisma': {
      organizationMembership: { findUnique: async () => null },
      enrollment: { findUnique: async () => ({ status: 'Active' }) },
      quizAttempt: { findMany: async ({ where }) => { query = where; return []; } },
    },
  }, { id: 'removed-member', role: 'teacher' });
  assert.deepEqual(await reader.getMyQuizAttempts(), []);
  const courseScope = query.lessonCell.is.lesson.is.chapter.is.course.is;
  assert.equal(courseScope.organization.is.memberships.some.userId, 'removed-member');
  assert.equal(courseScope.organization.is.memberships.some.role, 'STUDENT');
  assert.equal(courseScope.enrollment.some.userId, 'removed-member');
  assert.equal(courseScope.enrollment.some.status, 'Active');
});
