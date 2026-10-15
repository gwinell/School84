/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) { if (name in mocks) return mocks[name]; if (name === 'server-only') return {}; if (name === 'next/navigation') return { redirect: () => { throw Error('REDIRECT'); }, notFound: () => { throw Error('NOT_FOUND'); } }; if (name === './course-learner-access') { const db = mocks['@/lib/prisma']; return { getCourseLearnerAccess: async ({ userId, userRole, organizationId, courseId }) => { if (userRole === 'admin') return { status: 'Active', accessMode: 'ALL_AT_ONCE' }; const [membership, enrollment] = await Promise.all([db.organizationMembership?.findUnique?.({ where: { organizationId_userId: { organizationId, userId } } }), db.enrollment?.findUnique?.({ where: { userId_courseId: { userId, courseId } } })]); return membership?.role === 'STUDENT' && enrollment?.status === 'Active' ? enrollment : null; } }; } if (name === '@/lib/organization/access-policy') { const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/organization/access-policy.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; const mod = { exports: {} }; new Function('module', 'exports', js)(mod, mod.exports); return mod.exports; } if (name === '@/app/data/teacher/get-managed-course-ids') return { getManagedCourseIds: async () => (await mocks['@/lib/prisma']?.courseInstructor?.findMany?.()).map((row) => row.courseId) }; if (name === '@/app/data/organization/authorization') return { requireOrganizationRole: async () => ({ session: { user: { id: 'teacher-a', role: 'teacher' } }, membership: { role: 'OWNER' } }) }; if (name === '@/lib/resend') return { resend: { emails: { send: async () => ({}) } } }; if (name === '@/lib/arcjet') return { __esModule: true, default: { withRule() { return { protect: async () => ({ isDenied: () => false }) }; } }, fixedWindow: (config) => config }; if (name === '@arcjet/next') return { request: async () => ({}) }; return require(name); }, Date, Set, Map, Promise }, { filename: file });
  return exports;
}
test('course authorization permits only admin or assigned teacher', async () => {
  let memberships = 0, courseReads = 0;
  const courseDb = { course: { findUnique: async () => { courseReads++; return { id: 'course-a', title: 'A', slug: 'a', organizationId: 'school-a' }; } }, organizationMembership: { findUnique: async () => ({ role: 'TEACHER' }) }, courseInstructor: { findUnique: async () => { memberships++; return memberships === 1 ? { courseId: 'course-a' } : null; } } };
  const helper = load('app/data/teacher/require-course-teacher.ts', { '@/lib/prisma': courseDb, './require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-a', role: 'teacher' } }) } });
  assert.equal((await helper.requireCourseTeacher('course-a')).course.id, 'course-a');
  await assert.rejects(helper.requireCourseTeacher('course-b'), /REDIRECT/);
  assert.equal(courseReads, 2, 'course tenant identity is resolved before applying membership and instructor policy');
  const admin = load('app/data/teacher/require-course-teacher.ts', { '@/lib/prisma': courseDb, './require-teacher': { requireTeacher: async () => ({ user: { id: 'admin', role: 'admin' } }) } });
  assert.equal((await admin.requireCourseTeacher('course-a')).session.user.role, 'admin');
});
test('student quiz history filters by signed-in user and exposes no correctness flags', async () => {
  let query;
  const rows = [{ id: 'attempt', userId: 'student', lessonCellId: 'cell', selectedAnswers: [{ questionId: 'q', questionText: 'Q?', selectedAnswerIds: ['a'], selectedAnswerTexts: ['A'], isCorrect: true }], score: 1, total: 1, passed: true, submittedAt: new Date(), feedback: null }];
  const db = { enrollment: { findMany: async () => [{ courseId: 'course-a' }] }, quizAttempt: { findMany: async (args) => { query = args; return rows; } } };
  const reader = load('app/data/user/get-my-quiz-attempts.ts', { './require-user': { requireUser: async () => ({ user: { id: 'student', role: null } }) }, '@/lib/prisma': db });
  const result = await reader.getMyQuizAttempts();
  assert.equal(query.where.userId, 'student');
  assert.deepEqual(JSON.parse(JSON.stringify(query.where.lessonCell.is.lesson.is.chapter.is.courseId)), { in: ['course-a'] });
  assert.equal(result[0].selectedAnswers[0].questionText, 'Q?');
  assert.equal('isCorrect' in result[0].selectedAnswers[0], false);
});
test('soft due-date equality is on time; only later submissions are late', () => {
  const { isSubmissionLate } = load('lib/teacher/deadline.ts');
  const due = new Date('2026-10-14T12:00:00.000Z');
  assert.equal(isSubmissionLate(due, due), false);
  assert.equal(isSubmissionLate(new Date(due.getTime() + 1), due), true);
  assert.equal(isSubmissionLate(due, null), false);
});
test('teacher media access verifies school membership and course assignment before signing uploads', async () => {
  let courseReads = 0, membershipReads = 0;
  const access = load('app/api/s3/course-access.ts', { '@/lib/prisma': {
    courseInstructor: { findUnique: async () => { membershipReads++; return null; } },
    organizationMembership: { findUnique: async () => { membershipReads++; return { role: 'TEACHER' }; } },
    course: { findUnique: async () => { courseReads++; return { id: 'course-a', organizationId: 'school-a' }; } },
  } });
  assert.equal(await access.canAccessUploadCourse({ role: 'teacher', userId: 'teacher-b', courseId: 'course-a' }), false);
  assert.equal(membershipReads, 2);
  assert.equal(courseReads, 1, 'course is resolved to its school before the membership check');
  assert.equal(await access.canAccessUploadCourse({ role: 'student', userId: 'student', courseId: 'course-a' }), false);
  assert.equal(await access.canAccessUploadCourse({ role: 'admin', userId: 'admin' }), true);
  assert.equal(courseReads, 2);

  let deleted = 0;
  const discard = load('lib/s3/discard-upload.ts', { '@/lib/prisma': {
    pendingUpload: {
      findUnique: async () => ({ userId: 'teacher-a', courseId: 'course-a' }),
      delete: async () => { deleted++; },
    },
  }, '@aws-sdk/client-s3': { DeleteObjectCommand: class { constructor(value) { this.value = value; } } },
  '@/lib/env': { env: { NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: 'bucket' } },
  '@/lib/S3Client': { S3Client: { send: async () => {} } } });
  assert.equal(await discard.discardUpload('key', 'teacher-a', 'course-b'), 'not-owned');
  assert.equal(deleted, 0);
  assert.equal(await discard.discardUpload('key', 'teacher-a', 'course-a'), 'deleted');
  assert.equal(deleted, 1);
});
test('teacher editor accepts only current-course media or owned pending uploads', async () => {
  const media = load('lib/teacher/course-media.ts', { '@/lib/prisma': {
    pendingUpload: { findMany: async ({ where }) => where.courseId === 'course-a' && where.userId === 'teacher-a' && where.key.in.includes('new-upload') ? [{ key: 'new-upload' }] : [] },
  } });
  assert.equal(await media.canUseCourseMediaKeys({ keys: ['existing-key'], existingKeys: ['existing-key'], courseId: 'course-a', userId: 'teacher-a', role: 'teacher' }), true);
  assert.equal(await media.canUseCourseMediaKeys({ keys: ['new-upload'], courseId: 'course-a', userId: 'teacher-a', role: 'teacher' }), true);
  assert.equal(await media.canUseCourseMediaKeys({ keys: ['foreign-key'], courseId: 'course-a', userId: 'teacher-a', role: 'teacher' }), false);
  assert.equal(await media.canUseCourseMediaKeys({ keys: ['foreign-key'], courseId: 'course-a', userId: 'admin', role: 'admin' }), true);
  assert.deepEqual(Array.from(media.extractInlineMediaKeys('{"content":[{"attrs":{"key":"one"}},{"attrs":{"key":"one"}},{"attrs":{"key":"two"}}]}')), ['one', 'two']);
});
test('teacher feedback lookup is constrained to courses the teacher owns', async () => {
  let feedbackWrites = 0, codeQuery;
  const db = {
    courseInstructor: { findMany: async () => [{ courseId: 'course-a' }] },
    codeSubmission: { findFirst: async ({ where }) => { codeQuery = where; return where.id === 'submission-a' && where.lessonCell.lesson.chapter.courseId.in.includes('course-a') ? { id: 'submission-a', lessonCell: { lesson: { chapter: { courseId: 'course-a' } } } } : null; } },
    submissionFeedback: { upsert: async ({ create }) => { feedbackWrites++; return { id: 'feedback', ...create, updatedAt: new Date() }; } },
  };
  const actions = load('app/admin/courses/[courseId]/assignments/actions.ts', {
    '@/lib/prisma': db,
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-a', role: 'teacher' } }) },
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw Error('must not perform an unscoped course check'); } },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'student', role: null } }) },
    '@/lib/env': { env: { BETTER_AUTH_URL: 'https://school.test' } },
    'next/cache': { revalidatePath() {} },
    '@/lib/responses': { errorResponse: (message, data) => ({ status: 'error', message, data }), successResponse: (message, data) => ({ status: 'success', message, data }) },
  });
  const denied = await actions.submitReview({ codeSubmissionId: 'submission-b', score: 90, comment: 'Good' });
  assert.equal(denied.status, 'error'); assert.equal(feedbackWrites, 0);
  const allowed = await actions.submitReview({ codeSubmissionId: 'submission-a', score: 90, comment: 'Good' });
  assert.equal(allowed.status, 'success'); assert.equal(feedbackWrites, 1);
  assert.deepEqual(Array.from(codeQuery.lessonCell.lesson.chapter.courseId.in), ['course-a']);
});
