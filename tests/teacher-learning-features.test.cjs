/* eslint-disable @typescript-eslint/no-require-imports -- execute the real server modules with mocked infrastructure. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sourceRoot = process.env.FEATURE_SOURCE_ROOT || path.join(__dirname, '..');

function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name === 'next/navigation') return {
        notFound() { throw Error('NOT_FOUND'); },
        redirect(pathname) { throw Error(`REDIRECT:${pathname}`); },
      };
      if (name === '@/lib/responses') return {
        errorResponse: (message, data) => ({ status: 'error', message, data }),
        successResponse: (message, data) => ({ status: 'success', message, data }),
      };
      if (name === '@/lib/resend') return { resend: { emails: { send: async () => ({}) } } };
      if (name === '@/app/data/teacher/require-teacher') return { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) };
      if (name === '@/app/data/user/require-user') return { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) };
      return require(name);
    },
    Date, Map, Set, Object, console, ...globals,
  }, { filename: file });
  return exports;
}

const teacherActions = 'app/admin/courses/[courseId]/assignments/actions.ts';
const resumeActions = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/learning-cursor-actions.ts';
const quizHistory = 'app/data/user/get-my-quiz-attempts.ts';
const quizProgress = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/cell-progress-actions.ts';
const gradebook = 'app/data/teacher/get-course-gradebook.ts';
const notifications = 'app/data/user/get-my-notifications.ts';
const plain = (value) => JSON.parse(JSON.stringify(value));

function mockCourseTeacher({ role = 'teacher', userId = 'teacher-1', assigned = true, missing = false } = {}) {
  const calls = { course: 0, instructor: 0 };
  const prisma = {
    course: { findUnique: async () => { calls.course++; return missing ? null : { id: 'course-1', title: 'Course', slug: 'course' }; } },
    courseInstructor: { findUnique: async () => { calls.instructor++; return assigned ? { courseId: 'course-1' } : null; } },
  };
  const subject = load('app/data/teacher/require-course-teacher.ts', {
    '@/lib/prisma': prisma,
    './require-teacher': { requireTeacher: async () => ({ user: { id: userId, role } }) },
  });
  return { subject, calls };
}

test('course teacher guard permits only its assigned course and preserves admin access', async () => {
  const assigned = mockCourseTeacher();
  const result = await assigned.subject.requireCourseTeacher('course-1');
  assert.equal(result.course.id, 'course-1');
  assert.deepEqual(assigned.calls, { course: 1, instructor: 1 });

  const admin = mockCourseTeacher({ role: 'admin', assigned: false });
  assert.equal((await admin.subject.requireCourseTeacher('course-1')).session.user.role, 'admin');
  assert.equal(admin.calls.instructor, 0);
});

test('course teacher guard denies an unassigned teacher before course lookup and returns not found for assigned missing course', async () => {
  const foreign = mockCourseTeacher({ assigned: false });
  await assert.rejects(foreign.subject.requireCourseTeacher('course-2'), /REDIRECT:\/not-admin/);
  assert.equal(foreign.calls.instructor, 1);

  const missing = mockCourseTeacher({ missing: true });
  await assert.rejects(missing.subject.requireCourseTeacher('deleted-course'), /NOT_FOUND/);
  assert.equal(missing.calls.instructor, 1);
});

test('bulk assignment checks course scope before querying users or writing enrollments', async () => {
  const dbCalls = [];
  const mocks = {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('REDIRECT:/not-admin'); } },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': {
      user: { findMany: async () => { dbCalls.push('users'); return []; } },
      $transaction: async () => { dbCalls.push('transaction'); },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  };
  const subject = load(teacherActions, mocks);
  await assert.rejects(subject.bulkAssignStudents({ courseId: 'course-2', emails: ['student@example.test'] }), /REDIRECT:\/not-admin/);
  assert.deepEqual(dbCalls, []);
});

test('manual review rejects out-of-range, fractional, empty, and ambiguous targets before lookup', async () => {
  let lookups = 0;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' } }) },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': {
      codeSubmission: { findUnique: async () => { lookups++; return null; } },
      quizAttempt: { findUnique: async () => { lookups++; return null; } },
      submissionFeedback: { upsert: async () => { lookups++; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  for (const input of [
    { codeSubmissionId: 's1', score: -1, comment: 'x' },
    { codeSubmissionId: 's1', score: 101, comment: 'x' },
    { codeSubmissionId: 's1', score: 20.5, comment: 'x' },
    { codeSubmissionId: 's1', score: 20, comment: '  ' },
    { codeSubmissionId: 's1', quizAttemptId: 'q1', score: 20, comment: 'x' },
    { score: 20, comment: 'x' },
  ]) {
    assert.equal((await subject.submitReview(input)).status, 'error');
  }
  assert.equal(lookups, 0);
});

test('manual review resolves the target course and enforces its teacher scope before writing', async () => {
  let writes = 0;
  let targetQuery;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('should use scoped target lookup'); } },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-2', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': {
      courseInstructor: { findMany: async () => [{ courseId: 'course-2' }] },
      codeSubmission: { findFirst: async (query) => { targetQuery = query; return null; } },
      quizAttempt: { findFirst: async () => null },
      submissionFeedback: { upsert: async () => { writes++; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  assert.equal((await subject.submitReview({ codeSubmissionId: 'submission-1', score: 80, comment: 'Good work' })).status, 'error');
  assert.deepEqual(plain(targetQuery.where.lessonCell.lesson.chapter.courseId), { in: ['course-2'] });
  assert.equal(writes, 0);
});

test('manual review persists only a bounded score and comment after checking the submission course', async () => {
  const writes = [];
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' } }) },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': {
      courseInstructor: { findMany: async () => [{ courseId: 'course-1' }] },
      codeSubmission: { findFirst: async () => ({ id: 'submission-1', lessonCell: { lesson: { chapter: { courseId: 'course-1' } } } }) },
      quizAttempt: { findFirst: async () => null },
      submissionFeedback: { upsert: async (args) => { writes.push(args); return { id: 'feedback-1', score: args.create.score, comment: args.create.comment, updatedAt: new Date('2026-10-14T10:00:00Z') }; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  const result = await subject.submitReview({ codeSubmissionId: 'submission-1', score: 92, comment: 'Clear solution' });
  assert.equal(result.status, 'success');
  assert.equal(writes.length, 1);
  assert.deepEqual(plain(writes[0].where), { codeSubmissionId: 'submission-1' });
  assert.equal(writes[0].create.reviewerId, 'teacher-1');
  assert.equal(writes[0].create.score, 92);
  assert.equal(writes[0].create.comment, 'Clear solution');
});

test('invitation acceptance rejects an unverified or mismatched account without enrolling it', async () => {
  let enrollments = 0;
  const invitation = {
    id: 'invite-1', courseId: 'course-1', email: 'learner@example.test',
    acceptedAt: null, expiresAt: new Date(Date.now() + 60_000), accessMode: 'SEQUENTIAL', dueAt: null,
  };
  const make = (user) => load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' } }) },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user }) },
    '@/lib/prisma': {
      courseInvitation: { findUnique: async () => invitation },
      $transaction: async (fn) => fn({
        courseInvitation: { updateMany: async () => ({ count: 1 }) },
        enrollment: { upsert: async () => { enrollments++; } },
      }),
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  const unverified = await make({ id: 'learner-1', role: 'user', email: 'learner@example.test', emailVerified: false })
    .acceptCourseInvitation('valid-token-value-that-is-long-enough-123456');
  assert.equal(unverified.status, 'error');
  const mismatch = await make({ id: 'learner-2', role: 'user', email: 'other@example.test', emailVerified: true })
    .acceptCourseInvitation('valid-token-value-that-is-long-enough-123456');
  assert.equal(mismatch.status, 'error');
  assert.equal(enrollments, 0);
});

function invitationAction({ emailMode = 'resend', mailResult = {}, mailThrows = false } = {}) {
  const events = [];
  let invitationRecord;
  const action = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({
      session: { user: { id: 'teacher-1', role: 'teacher' } },
      course: { id: 'course-1', title: 'Course <One>' },
    }) },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'https://school.example.test', EMAIL_FROM: 'school@example.test', AUTH_EMAIL_MODE: emailMode } },
    '@/lib/resend': { resend: { emails: { send: async (message) => { events.push({ type: 'mail', message }); if (mailThrows) throw Error('provider offline'); return mailResult; } } } },
    '@/lib/prisma': {
      user: { findFirst: async () => null },
      $transaction: async (callback) => callback({
        courseInvitation: {
          deleteMany: async () => { events.push({ type: 'replace' }); },
          create: async ({ data }) => { invitationRecord = data; events.push({ type: 'create' }); },
        },
      }),
    },
  }, { console: { info: (message) => events.push({ type: 'console', message }), error: (message) => events.push({ type: 'error', message }) } });
  return { action: action.inviteStudentToCourse, events, invitationRecord: () => invitationRecord };
}

test('course invitation persists first, then sends a Resend email with an escaped title and usable link', async () => {
  const fixture = invitationAction();
  const result = await fixture.action({ courseId: 'course-1', email: 'new-student@example.test', accessMode: 'ALL_AT_ONCE' });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'sent');
  assert.match(result.data.inviteUrl, /^https:\/\/school\.example\.test\/invite\/[A-Za-z0-9_-]+$/);
  assert.ok(fixture.invitationRecord().tokenHash);
  assert.deepEqual(fixture.events.map((event) => event.type), ['replace', 'create', 'mail']);
  const mail = plain(fixture.events.at(-1).message);
  assert.deepEqual(mail.to, ['new-student@example.test']);
  assert.equal(mail.from, 'school@example.test');
  assert.match(mail.text, new RegExp(result.data.inviteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(mail.html, /Course &lt;One&gt;/);
  assert.doesNotMatch(mail.html, /Course <One>/);
});

test('provider failure leaves the invitation and link available for manual delivery', async () => {
  const fixture = invitationAction({ mailResult: { error: { message: 'provider unavailable' } } });
  const result = await fixture.action({ courseId: 'course-1', email: 'new-student@example.test', accessMode: 'SEQUENTIAL' });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'failed');
  assert.match(result.data.inviteUrl, /\/invite\//);
  assert.ok(fixture.invitationRecord());
  assert.deepEqual(fixture.events.map((event) => event.type), ['replace', 'create', 'mail', 'error']);
});

test('console email mode logs the invite locally and never calls the email provider', async () => {
  const fixture = invitationAction({ emailMode: 'console' });
  const result = await fixture.action({ courseId: 'course-1', email: 'local-student@example.test', accessMode: 'ALL_AT_ONCE' });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'console');
  assert.match(fixture.events.find((event) => event.type === 'console').message, new RegExp(result.data.inviteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(fixture.events.some((event) => event.type === 'mail'), false);
  assert.ok(fixture.invitationRecord());
});

test('learner quiz history query is scoped to the signed-in user and active course enrollment', async () => {
  let historyQuery;
  const subject = load(quizHistory, {
    './require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/lib/prisma': {
      lessonCell: { findUnique: async () => ({ id: 'quiz-cell', lesson: { chapter: { courseId: 'course-1' } } }) },
      enrollment: { findUnique: async () => ({ status: 'Active' }) },
      quizAttempt: { findMany: async (query) => { historyQuery = query; return []; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  await subject.getMyQuizAttempts('quiz-cell');
  assert.deepEqual(plain(historyQuery.where), { userId: 'learner-1', lessonCellId: 'quiz-cell' });
  assert.equal(historyQuery.select.selectedAnswers, true);
  assert.equal(historyQuery.select.feedback.select.comment, true);
  assert.equal(historyQuery.select.correctAnswers, undefined);
});

test('quiz history is empty for a learner whose enrollment was revoked', async () => {
  let historyReads = 0;
  const subject = load(quizHistory, {
    './require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' } }) },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/lib/prisma': {
      lessonCell: { findUnique: async () => ({ id: 'quiz-cell', lesson: { chapter: { courseId: 'course-1' } } }) },
      enrollment: { findUnique: async () => ({ status: 'Cancelled' }) },
      quizAttempt: { findMany: async () => { historyReads++; return [{ id: 'private-attempt' }]; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  assert.deepEqual(plain(await subject.getMyQuizAttempts('quiz-cell')), []);
  assert.equal(historyReads, 0);
});

test('quiz submissions persist an append-only answer snapshot and derive the score on the server', async () => {
  const attempts = [];
  let writes = 0;
  const db = {
    lessonCell: {
      findUnique: async () => ({ id: 'quiz-cell', lessonId: 'lesson-1', type: 'QUIZ', quiz: { questions: [
        { id: 'q1', text: 'Pick the correct option', answers: [
          { id: 'a1', text: 'Correct', isCorrect: true }, { id: 'a2', text: 'Wrong', isCorrect: false },
        ] },
      ] }, lesson: { chapter: { course: { id: 'course-1', slug: 'course', status: 'PUBLISHED' } } } }),
      findMany: async () => [{ id: 'quiz-cell' }],
    },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'ALL_AT_ONCE' }) },
    quizAttempt: { create: async ({ data }) => { attempts.push(data); } },
    $transaction: async (fn) => fn({
      lessonCellProgress: { upsert: async () => { writes++; }, count: async () => 1 },
      lessonProgress: { upsert: async () => {} },
    }),
  };
  const subject = load(quizProgress, {
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/lib/course-access': { canAccessAssignedLesson: async () => true },
    '@/lib/prisma': db,
  });
  const result = await subject.passLessonCellAction({ cellId: 'quiz-cell', quizAnswers: { q1: ['a1', 'a1', 'unknown'] } });
  assert.equal(result.status, 'success');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].userId, 'learner-1');
  assert.equal(attempts[0].score, 1);
  assert.equal(attempts[0].total, 1);
  assert.equal(attempts[0].passed, true);
  assert.deepEqual(plain(attempts[0].selectedAnswers), [{
    questionId: 'q1', questionText: 'Pick the correct option',
    selectedAnswerIds: ['a1'], selectedAnswerTexts: ['Correct'],
  }]);
  assert.equal(writes, 1);
  assert.equal(JSON.stringify(attempts[0]).includes('isCorrect'), false);
});

test('gradebook queries only the teacher course enrollment and curriculum cell IDs', async () => {
  const queries = {};
  const subject = load(gradebook, {
    './require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' }, session: { user: { id: 'teacher-1', role: 'teacher' } } }) },
    './require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/lib/teacher/deadline': { isSubmissionLate: () => false },
    '@/lib/prisma': {
      course: { findUniqueOrThrow: async () => ({ id: 'course-1', title: 'Course One', enrollment: [
        { id: 'e1', status: 'Active', accessMode: 'ALL_AT_ONCE', dueAt: null, createdAt: new Date(), user: { id: 'learner-1', name: 'Learner One', email: 'one@example.test' } },
      ], instructors: [], courseChapters: [{ lessons: [{ id: 'lesson-1', cells: [{ id: 'cell-1' }] }] }] }) },
      lessonCellProgress: { findMany: async (query) => { queries.progress = query; return []; } },
      codeSubmission: { findMany: async (query) => { queries.submissions = query; return []; } },
      quizAttempt: { findMany: async (query) => { queries.attempts = query; return []; } },
      learningActivityHeartbeat: { findMany: async (query) => { queries.activity = query; return []; } },
      learningCursor: { findMany: async (query) => { queries.cursors = query; return []; } },
    },
  });
  const result = await subject.getCourseGradebook('course-1');
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].user.id, 'learner-1');
  assert.deepEqual(plain(queries.progress.where), { userId: { in: ['learner-1'] }, lessonCellId: { in: ['cell-1'] } });
  assert.deepEqual(plain(queries.submissions.where), { userId: { in: ['learner-1'] }, lessonCellId: { in: ['cell-1'] } });
  assert.deepEqual(plain(queries.attempts.where), { userId: { in: ['learner-1'] }, lessonCellId: { in: ['cell-1'] } });
  assert.deepEqual(plain(queries.cursors.where), { courseId: 'course-1' });
});

test('teacher deadline update preserves the exact UTC instant and limits writes to an active course enrollment', async () => {
  let update;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({ course: { id: 'course-1' } }) },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': {
      enrollment: { updateMany: async (query) => { update = query; return { count: 1 }; } },
      studentNotification: { deleteMany: async () => ({ count: 0 }) },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  const dueAt = '2026-11-01T18:30:00.000Z';
  const result = await subject.setEnrollmentDueDate({ courseId: 'course-1', userId: 'learner-1', dueAt });
  assert.equal(result.status, 'success');
  assert.deepEqual(plain(update.where), { courseId: 'course-1', userId: 'learner-1', status: 'Active' });
  assert.equal(update.data.dueAt.toISOString(), dueAt);
});

test('invalid deadlines and unassigned course teachers cannot alter enrollments', async () => {
  let writes = 0;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('REDIRECT:/not-admin'); } },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-2', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/prisma': { enrollment: { updateMany: async () => { writes++; return { count: 1 }; } } },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  assert.equal((await subject.setEnrollmentDueDate({ courseId: 'course-1', userId: 'learner-1', dueAt: 'tomorrow' })).status, 'error');
  await assert.rejects(subject.setEnrollmentDueDate({ courseId: 'course-2', userId: 'learner-1', dueAt: null }), /REDIRECT:\/not-admin/);
  assert.equal(writes, 0);
});

test('due notifications are generated only from the signed-in learner active enrollments', async () => {
  let enrollmentQuery;
  let noticeWrite;
  let notificationQuery;
  const subject = load(notifications, {
    './require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/lib/prisma': {
      enrollment: { findMany: async (query) => {
        enrollmentQuery = query;
        return [{ userId: 'learner-1', courseId: 'course-1', dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), course: { title: 'Course One', courseChapters: [{ lessons: [{ cells: [{ id: 'cell-1' }] }] }] } }];
      } },
      lessonCellProgress: { count: async () => 0 },
      studentNotification: {
        deleteMany: async () => ({ count: 0 }),
        upsert: async (query) => { noticeWrite = query; },
        findMany: async (query) => { notificationQuery = query; return []; },
      },
    },
  });
  await subject.getMyNotifications();
  assert.equal(enrollmentQuery.where.userId, 'learner-1');
  assert.equal(enrollmentQuery.where.status, 'Active');
  assert.equal(noticeWrite.create.userId, 'learner-1');
  assert.equal(noticeWrite.create.courseId, 'course-1');
  assert.equal(notificationQuery.where.userId, 'learner-1');
});

test('resume position rejects a lesson from another course without persisting a cursor', async () => {
  let writes = 0;
  const subject = load(resumeActions, {
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/course-access': { canAccessAssignedLesson: async () => true },
    '@/lib/prisma': {
      lesson: { findUnique: async () => ({ id: 'lesson-1', chapter: { courseId: 'course-1', course: { slug: 'course', status: 'PUBLISHED' } }, cells: [{ id: 'cell-1' }] }) },
      enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'ALL_AT_ONCE' }) },
      learningCursor: { upsert: async () => { writes++; } },
    },
  });
  const result = await subject.setLastVisitedLearningPosition({ courseId: 'course-2', lessonId: 'lesson-1', cellId: 'cell-1' });
  assert.equal(result.status, 'error');
  assert.equal(writes, 0);
});

test('resume position rejects locked sequential lessons and unrelated cell IDs', async () => {
  let writes = 0;
  const setup = ({ cellId = 'cell-1', unlocked = false } = {}) => load(resumeActions, {
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/course-access': { canAccessAssignedLesson: async () => unlocked },
    '@/lib/prisma': {
      lesson: { findUnique: async () => ({ id: 'lesson-1', chapter: { courseId: 'course-1', course: { slug: 'course', status: 'PUBLISHED' } }, cells: [{ id: cellId }] }) },
      enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'SEQUENTIAL' }) },
      learningCursor: { upsert: async () => { writes++; } },
    },
  });
  const locked = await setup().setLastVisitedLearningPosition({ courseId: 'course-1', lessonId: 'lesson-1', cellId: 'cell-1' });
  assert.equal(locked.status, 'error');
  const wrongCell = await setup({ unlocked: true }).setLastVisitedLearningPosition({ courseId: 'course-1', lessonId: 'lesson-1', cellId: 'other-cell' });
  assert.equal(wrongCell.status, 'error');
  assert.equal(writes, 0);
});

test('resume position persists only the validated learner course lesson and cell', async () => {
  const writes = [];
  const subject = load(resumeActions, {
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student-1', role: 'user' } }) },
    '@/lib/course-access': { canAccessAssignedLesson: async () => true },
    '@/lib/prisma': {
      lesson: { findUnique: async () => ({ id: 'lesson-1', chapter: { courseId: 'course-1', course: { slug: 'course', status: 'PUBLISHED' } }, cells: [{ id: 'cell-1' }] }) },
      enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'SEQUENTIAL' }) },
      learningCursor: { upsert: async (args) => { writes.push(args); } },
    },
  });
  const result = await subject.setLastVisitedLearningPosition({ courseId: 'course-1', lessonId: 'lesson-1', cellId: 'cell-1' });
  assert.equal(result.status, 'success');
  assert.equal(writes.length, 1);
  assert.deepEqual(plain(writes[0].where), { userId_courseId: { userId: 'student-1', courseId: 'course-1' } });
  assert.equal(writes[0].create.cellId, 'cell-1');
});
