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
      if (name === '@/lib/organization/access-policy') {
        const source = fs.readFileSync(path.join(sourceRoot, 'lib/organization/access-policy.ts'), 'utf8');
        const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const policyModule = { exports: {} };
        new Function('module', 'exports', js)(policyModule, policyModule.exports);
        return policyModule.exports;
      }
      if (name === '@/app/data/organization/authorization') return {
        requireOrganizationRole: async () => ({ session: { user: { id: 'teacher-1', role: 'teacher' } }, membership: { role: 'OWNER' } }),
        resolveTenantCourse: async () => null,
      };
      if (name === '@/app/data/teacher/require-course-teacher') return {
        requireCourseTeacher: async (courseId) => ({ session: { user: { id: 'teacher-1', role: 'teacher' } }, course: { id: courseId, organizationId: 'org-1', slug: 'course' } }),
      };
      if (name === '@/app/data/teacher/get-managed-course-ids') return { getManagedCourseIds: async (userId, role) => {
        if (role === 'admin') return null;
        const prisma = mocks['@/lib/prisma'];
        const rows = prisma?.courseInstructor?.findMany ? await prisma.courseInstructor.findMany({ where: { userId } }) : [];
        return rows.map((row) => row.courseId);
      } };
      if (name === '@/lib/resend') return { resend: { emails: { send: async () => ({}) } } };
      if (name === '@/lib/arcjet') return { __esModule: true, default: { withRule() { return { protect: async () => ({ isDenied: () => false }) }; } }, fixedWindow: (config) => config };
      if (name === '@arcjet/next') return { request: async () => ({}) };
      if (name === '@/app/data/teacher/require-teacher') return { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) };
      if (name === '@/app/data/user/require-user') return { requireUser: async () => ({ user: { id: 'student-1', role: 'user', email: 'student@example.test', emailVerified: true } }) };
      if (name === '@/app/data/user/course-learner-access') {
        const db = mocks['@/lib/prisma'];
        return { getCourseLearnerAccess: async ({ userId, userRole, organizationId, courseId }) => {
          if (userRole === 'admin') return { status: 'Active', accessMode: 'ALL_AT_ONCE' };
          const [membership, enrollment] = await Promise.all([
            db.organizationMembership?.findUnique ? db.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } }) : { role: 'STUDENT' },
            db.enrollment?.findUnique ? db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }) : null,
          ]);
          return (membership?.role ?? 'STUDENT') === 'STUDENT' && enrollment?.status === 'Active' ? enrollment : null;
        } };
      }
      if (name === './course-learner-access') {
        const db = mocks['@/lib/prisma'];
        return { getCourseLearnerAccess: async ({ userId, userRole, organizationId, courseId }) => {
          if (userRole === 'admin') return { status: 'Active', accessMode: 'ALL_AT_ONCE' };
          const [membership, enrollment] = await Promise.all([
            db.organizationMembership?.findUnique?.({ where: { organizationId_userId: { organizationId, userId } } }),
            db.enrollment?.findUnique?.({ where: { userId_courseId: { userId, courseId } } }),
          ]);
          return membership?.role === 'STUDENT' && enrollment?.status === 'Active' ? enrollment : null;
        } };
      }
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
    course: { findUnique: async () => { calls.course++; return missing ? null : { id: 'course-1', title: 'Course', slug: 'course', organizationId: 'school-1' }; } },
    organizationMembership: { findUnique: async () => ({ role: 'TEACHER' }) },
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

test('course teacher guard denies unassigned membership and returns not found for missing course', async () => {
  const foreign = mockCourseTeacher({ assigned: false });
  await assert.rejects(foreign.subject.requireCourseTeacher('course-2'), /REDIRECT:\/not-admin/);
  assert.equal(foreign.calls.instructor, 1);

  const missing = mockCourseTeacher({ missing: true });
  await assert.rejects(missing.subject.requireCourseTeacher('deleted-course'), /NOT_FOUND/);
  assert.equal(missing.calls.instructor, 0);
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
  await assert.rejects(subject.bulkAssignStudents({ courseId: 'course-2', userIds: ['learner-1'] }), /REDIRECT:\/not-admin/);
  assert.deepEqual(dbCalls, []);
});

function bulkAssignmentAction({ users = [], denied = false, limiterThrows = false, arcjetEnabled = true } = {}) {
  const events = [];
  let limiterCalls = 0;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({
      session: { user: { id: 'teacher-1', role: 'teacher' } },
      course: { id: 'course-1', title: 'Course', organizationId: 'school-1' },
    }) },
    '@/lib/env': { env: { ARCJET_ENABLED: arcjetEnabled ? 'true' : 'false' } },
    '@/lib/arcjet': {
      __esModule: true,
      default: { withRule() { return { protect: async (_req, data) => {
        limiterCalls++;
        events.push({ type: 'limit', fingerprint: data.fingerprint });
        if (limiterThrows) throw Error('limiter unavailable');
        return { isDenied: () => denied };
      } }; } },
      fixedWindow: (config) => config,
    },
    '@arcjet/next': { request: async () => ({ requestId: 'mock' }) },
    '@/lib/prisma': {
      user: { findMany: async (query) => { events.push({ type: 'lookup', query }); return users; } },
      $transaction: async (callback) => callback({
        enrollment: { upsert: async (query) => events.push({ type: 'enrollment', query }) },
        studentNotification: { upsert: async (query) => events.push({ type: 'notification', query }) },
      }),
    },
  });
  return { action: subject.bulkAssignStudents, events, limiterCalls: () => limiterCalls };
}

test('bulk user-ID assignment response is generic and has no email lookup', async () => {
  const targets = [
    { name: 'new learner', id: 'learner-1', users: [{ id: 'learner-1', role: 'user', enrollment: [] }], writes: true },
    { name: 'already enrolled learner', id: 'learner-2', users: [{ id: 'learner-2', role: 'user', enrollment: [{ status: 'Active' }] }], writes: false },
    { name: 'teacher', id: 'teacher-2', users: [{ id: 'teacher-2', role: 'teacher', enrollment: [] }], writes: false },
    { name: 'admin', id: 'admin-2', users: [{ id: 'admin-2', role: 'admin', enrollment: [] }], writes: false },
    { name: 'unknown ID', id: 'missing-id', users: [], writes: false },
  ];
  const responses = [];
  for (const target of targets) {
    const fixture = bulkAssignmentAction({ users: target.users });
    const result = await fixture.action({ courseId: 'course-1', userIds: [target.id], accessMode: 'ALL_AT_ONCE' });
    assert.equal(result.status, 'success', target.name);
    assert.deepEqual(plain(result.data), { requested: 1 }, target.name);
    assert.equal(result.message, 'Запрос обработан. Доступ предоставлен подходящим аккаунтам.', target.name);
    assert.equal(fixture.events.filter((event) => event.type === 'enrollment').length > 0, target.writes, target.name);
    const lookupWhere = fixture.events.find((event) => event.type === 'lookup').query.where;
    assert.deepEqual(Object.keys(lookupWhere).sort(), ['id', 'organizationMemberships']);
    assert.deepEqual(plain(lookupWhere.organizationMemberships), { some: { organizationId: 'school-1', role: 'STUDENT' } });
    responses.push(plain(result));
  }
  for (const response of responses.slice(1)) assert.deepEqual(response, responses[0]);
});

function bulkInvitationAction({ emailMode = 'resend', users = [], deniedRateLimitCall = 0, failedEmails = new Set(), arcjetEnabled = true } = {}) {
  const events = [];
  const invitationRecords = [];
  let userLookups = 0;
  let enrollmentWrites = 0;
  let rateLimitCalls = 0;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({
      session: { user: { id: 'teacher-1', role: 'teacher' } },
      course: { id: 'course-1', title: 'Course <One>' },
    }) },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'https://school.example.test', EMAIL_FROM: 'school@example.test', AUTH_EMAIL_MODE: emailMode, ARCJET_ENABLED: arcjetEnabled ? 'true' : 'false' } },
    '@/lib/resend': { resend: { emails: { send: async (message) => {
      events.push({ type: 'mail', message });
      if (failedEmails.has(message.to[0])) throw Error('provider unavailable');
      return {};
    } } } },
    '@/lib/arcjet': {
      __esModule: true,
      default: { withRule() { return { protect: async (_req, data) => {
        rateLimitCalls++;
        events.push({ type: 'limit', fingerprint: data.fingerprint });
        return { isDenied: () => rateLimitCalls === deniedRateLimitCall };
      } }; } },
      fixedWindow: (config) => config,
    },
    '@arcjet/next': { request: async () => ({ requestId: 'mock' }) },
    '@/lib/prisma': {
      user: { findMany: async () => { userLookups++; return users; } },
      courseInvitation: { findUnique: async () => null },
      $transaction: async (callback) => callback({
        courseInvitation: {
          deleteMany: async (query) => { events.push({ type: 'replace', query }); },
          create: async ({ data }) => { invitationRecords.push(data); events.push({ type: 'create', data }); },
          updateMany: async () => ({ count: 1 }),
        },
        enrollment: { upsert: async (query) => { enrollmentWrites++; events.push({ type: 'enrollment', query }); } },
        studentNotification: { upsert: async () => {} },
      }),
    },
  }, { console: { info: (message) => events.push({ type: 'console', message }), error: (message) => events.push({ type: 'error', message }) } });
  return {
    action: subject.bulkInviteStudentsToCourse,
    events,
    records: () => invitationRecords,
    userLookups: () => userLookups,
    enrollmentWrites: () => enrollmentWrites,
    rateLimitCalls: () => rateLimitCalls,
  };
}

test('bulk email invitations have identical results for learner, enrolled, role and unknown addresses without lookup or enrollment', async () => {
  const states = [
    { name: 'unassigned learner', user: { id: 'learner-1', role: 'user', enrollment: [] } },
    { name: 'enrolled learner', user: { id: 'learner-2', role: 'user', enrollment: [{ status: 'Active' }] } },
    { name: 'teacher', user: { id: 'teacher-2', role: 'teacher', enrollment: [] } },
    { name: 'admin', user: { id: 'admin-2', role: 'admin', enrollment: [] } },
    { name: 'unknown', user: null },
  ];
  const responses = [];
  for (const [index, state] of states.entries()) {
    const fixture = bulkInvitationAction({ users: state.user ? [state.user] : [] });
    const email = `person-${index}@example.test`;
    const result = await fixture.action({ courseId: 'course-1', emails: [email], accessMode: 'SEQUENTIAL' });
    assert.equal(result.status, 'success', state.name);
    assert.equal(result.message, 'Запрос обработан. Приглашения отправлены или подготовлены для передачи; ссылка действует 7 дней.', state.name);
    assert.deepEqual(plain(result.data), { requested: 1, invalidCount: 0, sent: 1, failed: 0, emailDelivery: 'sent', manualInvites: [] }, state.name);
    assert.equal(fixture.records().length, 1, state.name);
    assert.equal(fixture.records()[0].email, email, state.name);
    assert.ok(fixture.records()[0].tokenHash, state.name);
    assert.equal('token' in fixture.records()[0], false, state.name);
    assert.equal(fixture.userLookups(), 0, state.name);
    assert.equal(fixture.enrollmentWrites(), 0, state.name);
    assert.equal(fixture.events.filter((event) => event.type === 'mail').length, 1, state.name);
    responses.push(plain(result));
  }
  for (const response of responses.slice(1)) assert.deepEqual(response, responses[0]);
});

test('bulk invitation preflight denies a later recipient without persisting or sending any part of the batch', async () => {
  const fixture = bulkInvitationAction({ deniedRateLimitCall: 4 });
  const result = await fixture.action({ courseId: 'course-1', emails: ['one@example.test', 'two@example.test'] });
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Не удалось обработать приглашения. Повторите позже.');
  assert.equal(fixture.rateLimitCalls(), 4);
  assert.deepEqual(fixture.events.map((event) => event.type), ['limit', 'limit', 'limit', 'limit']);
  assert.equal(fixture.records().length, 0);
  assert.equal(fixture.events.some((event) => event.type === 'mail'), false);
  assert.equal(fixture.userLookups(), 0);
  assert.equal(fixture.enrollmentWrites(), 0);
});

test('bulk invitations preserve failed addresses and expose manual links while continuing the batch', async () => {
  const fixture = bulkInvitationAction({ failedEmails: new Set(['two@example.test']) });
  const result = await fixture.action({ courseId: 'course-1', emails: ['one@example.test', 'two@example.test'] });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'partial');
  assert.equal(result.data.sent, 1);
  assert.equal(result.data.failed, 1);
  assert.equal(result.data.manualInvites.length, 1);
  assert.equal(result.data.manualInvites[0].email, 'two@example.test');
  assert.match(result.data.manualInvites[0].inviteUrl, /^https:\/\/school\.example\.test\/invite\/[A-Za-z0-9_-]+$/);
  assert.equal(fixture.records().length, 2, 'both links remain backed by stored invitations');
  assert.equal(fixture.events.filter((event) => event.type === 'mail').length, 2, 'a failed recipient does not prevent later sends');
});

test('bulk invitation console mode returns manual links and never calls Resend', async () => {
  const fixture = bulkInvitationAction({ emailMode: 'console' });
  const result = await fixture.action({ courseId: 'course-1', emails: ['one@example.test', 'two@example.test'] });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'console');
  assert.equal(result.data.manualInvites.length, 2);
  assert.equal(fixture.records().length, 2);
  assert.equal(fixture.events.some((event) => event.type === 'mail'), false);
  assert.equal(fixture.events.filter((event) => event.type === 'console').length, 2);
  assert.equal(fixture.userLookups(), 0);
  assert.equal(fixture.enrollmentWrites(), 0);
});

test('bulk invitations keep a bounded local/demo actor limit across ten-address batches', async () => {
  const fixture = bulkInvitationAction({ emailMode: 'console', arcjetEnabled: false });
  const first = await fixture.action({ courseId: 'course-1', emails: Array.from({ length: 10 }, (_, index) => `local-${index}@example.test`) });
  assert.equal(first.status, 'success');
  assert.equal(first.data.manualInvites.length, 10);
  assert.equal(fixture.rateLimitCalls(), 0, 'local mode never calls Arcjet');
  assert.equal(fixture.records().length, 10);
  const second = await fixture.action({ courseId: 'course-1', emails: ['eleventh@example.test'] });
  assert.equal(second.status, 'error');
  assert.equal(fixture.records().length, 10, 'denied batches do not persist invitations');
  assert.equal(fixture.events.filter((event) => event.type === 'console').length, 10);
  assert.equal(fixture.events.filter((event) => event.type === 'mail').length, 0);
});

test('bulk invitations enforce a ten-address cap and report malformed addresses without identifying accounts', async () => {
  const tooMany = bulkInvitationAction();
  const rejected = await tooMany.action({ courseId: 'course-1', emails: Array.from({ length: 11 }, (_, index) => `person-${index}@example.test`) });
  assert.equal(rejected.status, 'error');
  assert.equal(tooMany.rateLimitCalls(), 0);
  assert.equal(tooMany.records().length, 0);
  assert.equal(tooMany.events.some((event) => event.type === 'mail'), false);

  const mixed = bulkInvitationAction();
  const result = await mixed.action({ courseId: 'course-1', emails: ['valid@example.test', 'not an email'] });
  assert.equal(result.status, 'success');
  assert.equal(result.data.requested, 1);
  assert.equal(result.data.invalidCount, 1);
  assert.equal(mixed.records().length, 1);
  assert.equal(mixed.userLookups(), 0);
});

test('bulk invitations retain exact course authorization before preflight or side effects', async () => {
  const events = [];
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('REDIRECT:/not-admin'); } },
    '@/lib/env': { env: { ARCJET_ENABLED: 'true' } },
    '@/lib/prisma': { user: { findMany: async () => { events.push('lookup'); return []; } }, $transaction: async () => { events.push('transaction'); } },
    '@/lib/arcjet': { __esModule: true, default: { withRule: () => ({ protect: async () => { events.push('limit'); return { isDenied: () => false }; } }) }, fixedWindow: (config) => config },
    '@arcjet/next': { request: async () => ({}) },
    '@/lib/resend': { resend: { emails: { send: async () => { events.push('mail'); return {}; } } } },
  });
  await assert.rejects(subject.bulkInviteStudentsToCourse({ courseId: 'other-course', emails: ['student@example.test'] }), /REDIRECT:\/not-admin/);
  assert.deepEqual(events, []);
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

test('accepting a verified matching bulk invitation enrolls the learner only at acceptance', async () => {
  const token = 'valid-token-value-that-is-long-enough-123456';
  const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
  const writes = [];
  let invitationClaimed = false;
  const subject = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('not used'); } },
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-1', role: 'teacher' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user', email: 'student@example.test', emailVerified: true } }) },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'https://school.example.test', ARCJET_ENABLED: 'true' } },
    '@/lib/prisma': {
      courseInvitation: { findUnique: async ({ where }) => {
        assert.equal(where.tokenHash, tokenHash);
        return { id: 'invite-1', courseId: 'course-1', email: 'STUDENT@example.test', acceptedAt: null, expiresAt: new Date(Date.now() + 60_000), accessMode: 'SEQUENTIAL', dueAt: null };
      } },
      $transaction: async (callback) => callback({
        courseInvitation: { updateMany: async () => { invitationClaimed = true; return { count: 1 }; } },
        course: { findUnique: async () => ({ organizationId: 'school-1' }) },
        organizationMembership: { upsert: async () => {} },
        enrollment: { upsert: async (query) => writes.push(query) },
        studentNotification: { upsert: async () => {} },
      }),
    },
  });
  const result = await subject.acceptCourseInvitation(token);
  assert.equal(result.status, 'success');
  assert.equal(invitationClaimed, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].create.userId, 'learner-1');
  assert.equal(writes[0].create.courseId, 'course-1');
  assert.equal(writes[0].create.accessMode, 'SEQUENTIAL');
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

function invitationAction({ emailMode = 'resend', mailResult = {}, mailThrows = false, userRecord = null, deniedRateLimitCall = 0, arcjetEnabled = true } = {}) {
  const events = [];
  let invitationRecord;
  let userLookups = 0;
  let rateLimitCalls = 0;
  const action = load(teacherActions, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => ({
      session: { user: { id: 'teacher-1', role: 'teacher' } },
      course: { id: 'course-1', title: 'Course <One>' },
    }) },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'https://school.example.test', EMAIL_FROM: 'school@example.test', AUTH_EMAIL_MODE: emailMode, ARCJET_ENABLED: arcjetEnabled ? 'true' : 'false' } },
    '@/lib/resend': { resend: { emails: { send: async (message) => { events.push({ type: 'mail', message }); if (mailThrows) throw Error('provider offline'); return mailResult; } } } },
    '@/lib/arcjet': {
      __esModule: true,
      default: { withRule() { return { protect: async (_req, data) => {
        rateLimitCalls++;
        events.push({ type: 'limit', fingerprint: data.fingerprint });
        return { isDenied: () => rateLimitCalls === deniedRateLimitCall };
      } }; } },
      fixedWindow: (config) => config,
    },
    '@arcjet/next': { request: async () => ({ requestId: 'mock' }) },
    '@/lib/prisma': {
      user: { findFirst: async () => { userLookups++; return userRecord; } },
      $transaction: async (callback) => callback({
        courseInvitation: {
          deleteMany: async () => { events.push({ type: 'replace' }); },
          create: async ({ data }) => { invitationRecord = data; events.push({ type: 'create' }); },
        },
      }),
    },
  }, { console: { info: (message) => events.push({ type: 'console', message }), error: (message) => events.push({ type: 'error', message }) } });
  return { action: action.inviteStudentToCourse, events, invitationRecord: () => invitationRecord, userLookups: () => userLookups, rateLimitCalls: () => rateLimitCalls };
}

test('course invitation persists first, then sends a Resend email with an escaped title and usable link', async () => {
  const fixture = invitationAction();
  const result = await fixture.action({ courseId: 'course-1', email: 'new-student@example.test', accessMode: 'ALL_AT_ONCE' });
  assert.equal(result.status, 'success');
  assert.equal(result.data.emailDelivery, 'sent');
  assert.match(result.data.inviteUrl, /^https:\/\/school\.example\.test\/invite\/[A-Za-z0-9_-]+$/);
  assert.ok(fixture.invitationRecord().tokenHash);
  assert.deepEqual(fixture.events.map((event) => event.type), ['limit', 'limit', 'replace', 'create', 'mail']);
  const mail = plain(fixture.events.at(-1).message);
  assert.deepEqual(mail.to, ['new-student@example.test']);
  assert.equal(mail.from, 'school@example.test');
  assert.match(mail.subject, /SchoolSphere/);
  assert.match(mail.text, /SchoolSphere/);
  assert.match(mail.html, /SchoolSphere/);
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
  assert.deepEqual(fixture.events.map((event) => event.type), ['limit', 'limit', 'replace', 'create', 'mail', 'error']);
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

test('invitation response and side effects do not disclose whether the email is unknown, enrolled, a learner, or a teacher', async () => {
  const targetStates = [
    { name: 'unknown', userRecord: null },
    { name: 'registered learner', userRecord: { id: 'learner-1', role: 'user', enrollment: [] } },
    { name: 'already enrolled', userRecord: { id: 'learner-2', role: 'user', enrollment: [{ status: 'Active' }] } },
    { name: 'teacher', userRecord: { id: 'teacher-2', role: 'teacher', enrollment: [] } },
  ];
  const publicResponses = [];
  for (const state of targetStates) {
    const fixture = invitationAction({ userRecord: state.userRecord });
    const result = await fixture.action({ courseId: 'course-1', email: `${state.name.replaceAll(' ', '-')}@example.test`, accessMode: 'ALL_AT_ONCE' });
    assert.equal(result.status, 'success', state.name);
    assert.equal(result.message, 'Если адрес может принять приглашение, ссылка отправлена или подготовлена для передачи; она действует 7 дней');
    assert.equal(result.data.emailDelivery, 'sent');
    assert.equal(result.data.alreadyAssigned, false);
    assert.match(result.data.inviteUrl, /^https:\/\/school\.example\.test\/invite\/[A-Za-z0-9_-]+$/);
    assert.ok(fixture.invitationRecord(), state.name);
    assert.equal(fixture.events.filter((event) => event.type === 'mail').length, 1, state.name);
    assert.equal(fixture.userLookups(), 0, 'account and role state are never queried');
    publicResponses.push({ status: result.status, message: result.message, emailDelivery: result.data.emailDelivery, alreadyAssigned: result.data.alreadyAssigned, hasLink: Boolean(result.data.inviteUrl), mailCount: fixture.events.filter((event) => event.type === 'mail').length, invitationCreated: Boolean(fixture.invitationRecord()) });
  }
  const expected = publicResponses[0];
  for (const response of publicResponses.slice(1)) {
    assert.deepEqual(response, expected);
  }
});

test('invitation rate limits are keyed by teacher and normalized recipient and stop DB/provider side effects', async () => {
  const fixture = invitationAction({ deniedRateLimitCall: 2 });
  const result = await fixture.action({ courseId: 'course-1', email: '  STUDENT@Example.Test  ', accessMode: 'ALL_AT_ONCE' });
  assert.equal(result.status, 'error');
  assert.equal(result.message, 'Не удалось обработать приглашение. Повторите позже.');
  assert.equal(fixture.rateLimitCalls(), 2);
  assert.deepEqual(fixture.events.map((event) => event.type), ['limit', 'limit']);
  assert.notEqual(fixture.events[0].fingerprint, fixture.events[1].fingerprint);
  assert.equal(fixture.userLookups(), 0);
  assert.equal(fixture.invitationRecord(), undefined);
});

test('teacher-wide invitation limit short-circuits before checking the recipient bucket', async () => {
  const fixture = invitationAction({ deniedRateLimitCall: 1 });
  const result = await fixture.action({ courseId: 'course-1', email: 'student@example.test', accessMode: 'ALL_AT_ONCE' });
  assert.equal(result.status, 'error');
  assert.equal(fixture.rateLimitCalls(), 1);
  assert.deepEqual(fixture.events.map((event) => event.type), ['limit']);
  assert.equal(fixture.userLookups(), 0);
  assert.equal(fixture.invitationRecord(), undefined);
});

test('normalized email casing and whitespace share the same recipient limiter bucket', async () => {
  const fixture = invitationAction();
  await fixture.action({ courseId: 'course-1', email: '  STUDENT@Example.Test ', accessMode: 'ALL_AT_ONCE' });
  await fixture.action({ courseId: 'course-1', email: 'student@example.test', accessMode: 'ALL_AT_ONCE' });
  const fingerprints = fixture.events.filter((event) => event.type === 'limit').map((event) => event.fingerprint);
  assert.equal(fingerprints.length, 4);
  assert.equal(fingerprints[0], fingerprints[2], 'actor bucket is stable');
  assert.equal(fingerprints[1], fingerprints[3], 'normalized recipient bucket is stable');
  assert.equal(fixture.userLookups(), 0);
});

test('local/demo mode enforces invitation limits without Arcjet or real provider calls', async () => {
  const fixture = invitationAction({ arcjetEnabled: false, emailMode: 'console' });
  const input = { courseId: 'course-1', email: 'local@example.test', accessMode: 'ALL_AT_ONCE' };
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await fixture.action(input));
  assert.deepEqual(results.map((result) => result.status), ['success', 'success', 'success', 'error']);
  assert.equal(fixture.rateLimitCalls(), 0, 'local mode does not call Arcjet');
  assert.equal(fixture.events.filter((event) => event.type === 'mail').length, 0);
  assert.equal(fixture.events.filter((event) => event.type === 'console').length, 3);
  assert.equal(fixture.events.filter((event) => event.type === 'replace').length, 3);
});

test('learner quiz history query is scoped to the signed-in user and active course enrollment', async () => {
  let historyQuery;
  const subject = load(quizHistory, {
    './require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-1', role: 'user' } }) },
    '@/lib/prisma': {
      lessonCell: { findUnique: async () => ({ id: 'quiz-cell', lesson: { chapter: { courseId: 'course-1', course: { organizationId: 'school-1' } } } }) },
      organizationMembership: { findUnique: async () => ({ userId: 'learner-1', role: 'STUDENT' }) },
      enrollment: { findUnique: async () => ({ status: 'Active' }) },
      quizAttempt: { findMany: async (query) => { historyQuery = query; return []; } },
    },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'http://localhost' } },
  });
  await subject.getMyQuizAttempts('quiz-cell');
  const historyWhere = plain(historyQuery.where);
  assert.equal(historyWhere.userId, 'learner-1');
  assert.equal(historyWhere.lessonCellId, 'quiz-cell');
  assert.deepEqual(historyWhere.lessonCell.is.lesson.is.chapter.is.courseId, { in: ['course-1'] });
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
      lessonCell: { findUnique: async () => ({ id: 'quiz-cell', lesson: { chapter: { courseId: 'course-1', course: { organizationId: 'school-1' } } } }) },
      organizationMembership: { findUnique: async () => ({ userId: 'learner-1', role: 'STUDENT' }) },
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
