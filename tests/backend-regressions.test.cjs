/* eslint-disable @typescript-eslint/no-require-imports -- node:test uses CommonJS to mock compiled server modules without external test dependencies. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real server modules while replacing only infrastructure. No DB,
// mail, S3, runner, or live account is changed by these regression tests.
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name === 'next/navigation') return { notFound() { throw Error('NOT_FOUND'); }, redirect() { throw Error('REDIRECT'); } };
      if (name === '@/app/data/user/require-user' || name === './require-user') return { requireUser: async () => ({ user: { id: 'student', role: 'user' } }) };
      if (name === '@/lib/responses') return { errorResponse: (message, data) => ({ status: 'error', message, data }), successResponse: (message, data) => ({ status: 'success', message, data }) };
      if (name === '@/lib/arcjet') return { __esModule: true, default: { withRule() { return this; }, protect: async () => ({ isDenied: () => false }) }, fixedWindow: () => ({}) };
      if (name === '@arcjet/next') return { request: async () => ({}) };
      return require(name);
    }, Date, Map, Set, AbortSignal, console, ...globals,
  }, { filename: file });
  return exports;
}
const lessonAction = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/actions.ts';
function completion({ unlocked = true, passed = 0, cells = [{ id: 'code' }], status = 'PUBLISHED', mode = 'ALL_AT_ONCE' } = {}) {
  let writes = 0;
  const db = {
    lesson: { findUnique: async () => ({ id: 'lesson', chapter: { course: { id: 'course', slug: 'course', status } } }) },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: mode }) },
    lessonCell: { findMany: async () => cells }, lessonCellProgress: { count: async () => passed },
    lessonProgress: { upsert: async () => { writes++; } },
  };
  return { action: load(lessonAction, { '@/lib/prisma': db, '@/lib/course-access': { canAccessAssignedLesson: async () => unlocked } }).setLessonCompletionAction, writes: () => writes };
}
test('manual completion rejects unvalidated code/quiz cells', async () => {
  const c = completion(); assert.equal((await c.action({ lessonId: 'lesson', completed: true })).status, 'error'); assert.equal(c.writes(), 0);
});
test('manual completion succeeds after every cell is passed', async () => {
  const c = completion({ passed: 1 }); assert.equal((await c.action({ lessonId: 'lesson', completed: true })).status, 'success'); assert.equal(c.writes(), 1);
});
test('legacy lesson without cells still supports manual completion', async () => {
  const c = completion({ cells: [] }); assert.equal((await c.action({ lessonId: 'lesson', completed: true })).status, 'success');
});
test('manual completion cannot write locked or unpublished lesson progress', async () => {
  for (const options of [{ unlocked: false, mode: 'SEQUENTIAL' }, { status: 'DRAFT' }]) {
    const c = completion(options); assert.equal((await c.action({ lessonId: 'lesson', completed: false })).status, 'error'); assert.equal(c.writes(), 0);
  }
});
test('manual completion validates hostile runtime inputs', async () => {
  const c = completion(); assert.equal((await c.action({ lessonId: 'lesson', completed: 'false' })).status, 'error'); assert.equal(c.writes(), 0);
});

const cellAction = 'app/dashboard/courses/[slug]/(lesson)/[lessonId]/cell-progress-actions.ts';
function quizProgress() {
  let writes = 0;
  const db = {
    lessonCell: {
      findUnique: async () => ({ id: 'quiz-cell', lessonId: 'lesson', type: 'QUIZ', quiz: { questions: [
        { id: 'q1', answers: [{ id: 'a1', isCorrect: true }, { id: 'wrong', isCorrect: false }] },
        { id: 'q2', answers: [{ id: 'a2', isCorrect: true }, { id: 'a3', isCorrect: true }] },
      ] }, lesson: { chapter: { course: { id: 'course', slug: 'course', status: 'PUBLISHED' } } } }),
      findMany: async () => [{ id: 'quiz-cell' }],
    },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'ALL_AT_ONCE' }) },
    lessonCellProgress: { upsert: async () => { writes++; }, count: async () => 1 },
    lessonProgress: { upsert: async () => {} },
    $transaction: async (fn) => fn(db),
  };
  return { action: load(cellAction, { '@/lib/prisma': db, '@/lib/course-access': { canAccessAssignedLesson: async () => true } }).passLessonCellAction, writes: () => writes };
}
test('quiz completion rejects absent, wrong, omitted and duplicate answers', async () => {
  for (const answers of [undefined, {}, { q1: ['wrong'], q2: ['a2', 'a3'] }, { q1: ['a1'] }, { q1: ['a1'], q2: ['a2', 'a2'] }]) {
    const q = quizProgress(); assert.equal((await q.action({ cellId: 'quiz-cell', quizAnswers: answers })).status, 'error'); assert.equal(q.writes(), 0);
  }
});
test('quiz completion accepts all correct answers checked server-side', async () => {
  const q = quizProgress(); assert.equal((await q.action({ cellId: 'quiz-cell', quizAnswers: { q1: ['a1'], q2: ['a3', 'a2'] } })).status, 'success'); assert.equal(q.writes(), 1);
});

const courseFile = 'app/data/user/get-course-for-learning.ts';
test('reading course never converts stale lesson completed flags to passed tasks; locked media stays hidden', async () => {
  const signedKeys = []; const initialRows = []; let updates = 0;
  const lessons = [1, 2].map((n) => ({ id: `lesson${n}`, title: `Lesson ${n}`, description: 'Private content', videoKey: `video${n}`, position: n,
    lessonProgress: [{ completed: true }], cells: [{ id: `cell${n}`, type: 'CODE_TASK', position: 1, title: 'Task', textContent: null, taskPrompt: 'secret', starterCode: 'secret', examples: [], submissions: [], quiz: null }] }));
  const db = {
    course: { findUnique: async () => ({ id: 'course', title: 'Course', slug: 'course', smallDesc: '', fileKey: 'cover', status: 'PUBLISHED', courseChapters: [{ id: 'chapter', title: 'Chapter', position: 1, lessons }] }) },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'SEQUENTIAL' }) },
    lessonCellProgress: { createMany: async ({ data }) => initialRows.push(...data), updateMany: async () => { updates++; }, findMany: async () => [] },
  };
  const course = load(courseFile, { '@/lib/prisma': db, '@/lib/s3/get-download-url': { getDownloadUrl: async (key) => { signedKeys.push(key); return key ? `signed:${key}` : null; } }, '@/lib/course-access': { getSequentiallyUnlockedLessonIds: () => new Set(['lesson1']) } });
  const result = await course.getCourseForLearning({ slug: 'course', currentLessonId: 'lesson2' });
  assert.ok(initialRows.every((r) => r.status !== 'PASSED')); assert.equal(updates, 0);
  assert.ok(!signedKeys.includes('video2'));
  const locked = result.courseChapters[0].lessons[1]; assert.equal(locked.videoUrl, null); assert.equal(locked.description, null); assert.equal(locked.cells[0].taskPrompt, null);
});

test('certificate rejects stale lesson completion when current cells remain unpassed', async () => {
  let issued = 0;
  const db = {
    certificate: { findUnique: async () => null, create: async () => { issued++; } },
    course: { findUnique: async () => ({ id: 'course', title: 'Course', slug: 'course', status: 'PUBLISHED', level: 'BEGINNER', duration: 5, user: { name: 'Teacher' }, courseChapters: [{ lessons: [{ id: 'lesson', cells: [{ id: 'new-task' }] }] }] }) },
    lessonProgress: { count: async () => 1 }, lessonCellProgress: { count: async () => 0 }, user: { findUnique: async () => ({ name: 'Student' }) },
    $transaction: async (fn) => fn(db),
  };
  const subject = load('lib/certificates/issue-certificate-if-eligible.ts', { '@/lib/prisma': db, '@/lib/generated/prisma/client': { Prisma: {} }, './generate-verification-code': { generateVerificationCode: () => 'code' } });
  const result = await subject.issueCertificateIfEligible({ userId: 'student', courseId: 'course' });
  assert.equal(result.reason, 'not-complete'); assert.equal(issued, 0);
});

test('legacy quiz fetch enforces sequential lesson access', async () => {
  let reads = 0;
  const db = { lesson: { findUnique: async () => ({ chapter: { courseId: 'course', course: { status: 'PUBLISHED' } } }) }, enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'SEQUENTIAL' }) }, quiz: { findUnique: async () => { reads++; return null; } } };
  const subject = load('app/data/user/get-lesson-quiz.ts', { '@/lib/prisma': db, '@/lib/course-access': { canAccessAssignedLesson: async () => false } });
  assert.equal(await subject.getLessonQuizForUser({ lessonId: 'locked' }), null); assert.equal(reads, 0);
});

function s3(fail) {
  let recordsRemoved = 0; let deletes = 0;
  const db = { pendingUpload: { findUnique: async () => ({ userId: 'student' }), findMany: async () => [{ key: 'orphan' }], delete: async () => { recordsRemoved++; } } };
  const subject = load('lib/s3/discard-upload.ts', { '@/lib/prisma': db, '@/lib/env': { env: { NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: 'bucket' } }, '@/lib/S3Client': { S3Client: { send: async () => { deletes++; if (fail) throw Error('S3 unavailable'); } } }, '@aws-sdk/client-s3': { DeleteObjectCommand: class {} } });
  return { module: subject, recordsRemoved: () => recordsRemoved, deletes: () => deletes };
}
function uploadRoute() {
  let commands = 0; let signatures = 0; const writes = [];
  const subject = load('app/api/s3/upload/route.ts', {
    '@/lib/env': { env: { NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: 'bucket' } },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    'uuid': { v4: () => 'upload-id' },
    '@/lib/S3Client': { S3Client: {} },
    '@aws-sdk/client-s3': { PutObjectCommand: class { constructor() { commands++; } } },
    '@aws-sdk/s3-request-presigner': { getSignedUrl: async () => { signatures++; return 'signed:upload'; } },
    '@/lib/arcjet': { __esModule: true, default: { withRule() { return this; }, protect: async () => ({ isDenied: () => false }) }, detectBot: () => ({}), fixedWindow: () => ({}) },
    '@/app/data/admin/require-admin': { requireAdmin: async () => ({ user: { id: 'admin' } }) },
    '@/lib/prisma': { pendingUpload: { upsert: async (input) => { writes.push(input); } } },
  });
  return { subject, commands: () => commands, signatures: () => signatures, writes };
}
test('upload route exports only its supported Next.js handler', () => {
  assert.deepEqual(Object.keys(uploadRoute().subject), ['POST']);
});
test('upload route rejects invalid bodies before creating an S3 upload or pending record', async () => {
  const upload = uploadRoute();
  const valid = { fileName: 'cover.png', contentType: 'image/png', size: 42, isImage: true };
  for (const body of [null, {}, { ...valid, fileName: '' }, { ...valid, contentType: '' }, { ...valid, size: 0 }, { ...valid, size: '42' }, { ...valid, isImage: 'true' }]) {
    const response = await upload.subject.POST({ json: async () => body });
    assert.equal(response.status, 400);
    assert.equal(typeof response.body.error, 'string');
  }
  assert.equal(upload.commands(), 0); assert.equal(upload.signatures(), 0); assert.equal(upload.writes.length, 0);
});
test('upload route still signs valid uploads and records their owner', async () => {
  const upload = uploadRoute();
  const response = await upload.subject.POST({ json: async () => ({ fileName: 'cover.png', contentType: 'image/png', size: 42, isImage: true }) });
  assert.equal(response.status, 200); assert.equal(response.body.key, 'upload-id-cover.png'); assert.equal(response.body.presignedUrl, 'signed:upload');
  assert.equal(upload.commands(), 1); assert.equal(upload.signatures(), 1); assert.equal(upload.writes.length, 1);
  assert.equal(upload.writes[0].create.userId, 'admin'); assert.equal(upload.writes[0].create.key, response.body.key);
});
test('failed S3 discard retains the pending retry record', async () => {
  const s = s3(true); await assert.rejects(s.module.discardUpload('orphan', 'student'), /S3 unavailable/); assert.equal(s.recordsRemoved(), 0);
});
test('S3 orphan sweep counts failures and retains retry records', async () => {
  const s = s3(true); const result = await s.module.sweepOrphanUploads(); assert.equal(result.errors, 1); assert.equal(result.deleted, 0); assert.equal(s.recordsRemoved(), 0);
});
test('successful S3 discard removes pending record; other owners cannot delete', async () => {
  const s = s3(false); assert.equal(await s.module.discardUpload('orphan', 'other'), 'not-owned'); assert.equal(s.deletes(), 0);
  assert.equal(await s.module.discardUpload('orphan', 'student'), 'deleted'); assert.equal(s.recordsRemoved(), 1);
});

function submissions(runnerResponse, fetchGate) {
  const records = []; let fetches = 0; let passed = false; let queue = Promise.resolve(); let locks = 0;
  const db = {
    lessonCell: { findUnique: async () => ({ id: 'code', type: 'CODE_TASK', testCases: [{ input: '', output: '1' }], lintConfig: null, lessonId: 'lesson', lesson: { chapter: { course: { id: 'course', slug: 'course', status: 'PUBLISHED' } } } }), findMany: async () => [{ id: 'code' }] },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: 'ALL_AT_ONCE' }) },
    codeSubmission: {
      count: async ({ where }) => records.filter((record) => !where.status || record.status === where.status && record.errorText === where.errorText).length,
      create: async ({ data }) => { const id = `submission-${records.length}`; records.push({ id, ...data }); return { id }; },
      update: async ({ where, data }) => Object.assign(records.find((r) => r.id === where.id), data),
    },
    lessonCellProgress: { createMany: async () => {}, updateMany: async ({ data }) => { passed = data.status === 'PASSED'; return { count: 1 }; }, count: async () => 1 },
    lessonProgress: { upsert: async () => {} }, studentDailyActivity: { upsert: async () => {} },
    $executeRaw: async (query, userId) => { assert.match(query.join('?'), /pg_advisory_xact_lock/); assert.equal(userId, 'student'); locks++; },
    $transaction(fn) { const result = queue.then(() => fn(db)); queue = result.catch(() => {}); return result; },
  };
  const subject = load('app/dashboard/courses/[slug]/(lesson)/[lessonId]/code-submission-actions.ts', { '@/lib/prisma': db, '@/lib/env': { env: { PYTHON_RUNNER_URL: 'http://runner', PYTHON_RUNNER_TOKEN: 'test' } }, '@/lib/course-access': { canAccessAssignedLesson: async () => true } }, {
    fetch: async () => { fetches++; assert.ok(records.length > 0, 'admission must be persisted before network'); if (fetchGate) await fetchGate; return { ok: true, json: async () => runnerResponse }; },
  });
  return { subject, records, fetches: () => fetches, passed: () => passed, locks: () => locks };
}
test('inconsistent runner ACCEPTED never passes a code cell', async () => {
  const s = submissions({ status: 'ACCEPTED', passedTests: 0, totalTests: 1, durationMs: 10 });
  await s.subject.submitCodeTaskAction({ cellId: 'code', sourceCode: 'print(1)' });
  assert.equal(s.records.length, 1); assert.equal(s.records[0].status, 'SYSTEM_ERROR'); assert.equal(s.passed(), false);
});
test('concurrent submissions reserve atomic admission before runner and allow only one in flight', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const s = submissions({ status: 'ACCEPTED', passedTests: 1, totalTests: 1, durationMs: 10 }, gate);
  const results = Array.from({ length: 6 }, () => s.subject.submitCodeTaskAction({ cellId: 'code', sourceCode: 'print(1)' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.fetches(), 1); assert.equal(s.records.length, 1); assert.equal(s.locks(), 6);
  release(); const final = await Promise.all(results);
  assert.equal(final.filter((r) => r.status === 'error').length, 5);
  assert.equal(s.records[0].status, 'ACCEPTED'); assert.equal(s.passed(), true);
});
test('rate limit counts reserved submissions and still stops the sixth completed attempt', async () => {
  const s = submissions({ status: 'WRONG_ANSWER', passedTests: 0, totalTests: 1, durationMs: 10 });
  for (let i = 0; i < 5; i++) assert.equal((await s.subject.submitCodeTaskAction({ cellId: 'code', sourceCode: 'print(2)' })).status, 'success');
  assert.equal((await s.subject.submitCodeTaskAction({ cellId: 'code', sourceCode: 'print(2)' })).status, 'error');
  assert.equal(s.fetches(), 5); assert.equal(s.records.length, 5);
});

function discussion({ published = true, unlocked = true, mode = 'SEQUENTIAL' } = {}) {
  let writes = 0; let reads = 0;
  const db = {
    lesson: {
      findUnique: async () => ({ chapter: { course: { id: 'course', slug: 'course' } } }),
      findFirst: async () => published ? { id: 'lesson' } : null,
    },
    enrollment: { findUnique: async () => ({ status: 'Active', accessMode: mode }) },
    lessonComment: {
      create: async () => { writes++; return { id: 'comment', content: 'Hello', createdAt: new Date() }; },
      findUnique: async () => ({ id: 'comment', parentId: null, lessonId: 'lesson', lesson: { chapter: { course: { id: 'course', slug: 'course' } } } }),
    },
  };
  const subject = load('app/dashboard/courses/[slug]/(lesson)/[lessonId]/_lib/comment-actions.ts', {
    '@/lib/prisma': db, '@/lib/course-access': { canAccessAssignedLesson: async () => unlocked },
    '@/app/data/user/get-lesson-comments': { getLessonComments: async () => { reads++; return { items: [] }; } },
    '@/app/data/user/get-lesson-replies': { getLessonReplies: async () => { reads++; return { items: [] }; } },
  });
  return { subject, writes: () => writes, reads: () => reads };
}
test('discussion actions reject locked and unpublished lessons before reading or writing', async () => {
  for (const options of [{ unlocked: false }, { published: false }]) {
    const d = discussion(options);
    assert.equal((await d.subject.createCommentAction({ lessonId: 'lesson', content: 'Hello' })).status, 'error');
    assert.equal((await d.subject.getCommentsPageAction({ lessonId: 'lesson', page: 1, pageSize: 10, sort: 'oldest' })).status, 'error');
    assert.equal((await d.subject.createReplyAction({ commentId: 'comment', content: 'Hello' })).status, 'error');
    assert.equal((await d.subject.toggleCommentLikeAction({ commentId: 'comment' })).status, 'error');
    assert.equal((await d.subject.getRepliesPageAction({ commentId: 'comment', page: 1, pageSize: 10 })).status, 'error');
    assert.equal(d.writes(), 0); assert.equal(d.reads(), 0);
  }
});
test('discussion remains available for unlocked and all-at-once lessons', async () => {
  for (const options of [{ unlocked: true }, { unlocked: false, mode: 'ALL_AT_ONCE' }]) {
    const d = discussion(options);
    assert.equal((await d.subject.createCommentAction({ lessonId: 'lesson', content: 'Hello' })).status, 'success');
    assert.equal((await d.subject.getCommentsPageAction({ lessonId: 'lesson', page: 1, pageSize: 10, sort: 'oldest' })).status, 'success');
    assert.equal(d.writes(), 1); assert.equal(d.reads(), 1);
  }
});


test('CSV export neutralizes formulas in actor names and entity labels while preserving standard escaping', () => {
  const { csvEscape } = load('lib/activity/csv.ts');
  for (const payload of ['=1+1', '+SUM(1)', '-2+3', '@SUM(1)', '\t=1+1', '\r=1+1', '\n=1+1']) {
    assert.match(csvEscape(payload).replace(/^"/, ''), /^'/);
  }
  assert.equal(csvEscape('School "84", lesson'), '"School ""84"", lesson"');
  assert.equal(csvEscape('Ordinary title'), 'Ordinary title');
});
test('certificate issuance rejects unpublished curricula before accessing learner progress', async () => {
  for (const status of ['DRAFT', 'ARCHIVED']) {
    const db = { certificate: { findUnique: async () => null }, course: { findUnique: async () => ({ status }) }, $transaction: async (fn) => fn(db) };
    const subject = load('lib/certificates/issue-certificate-if-eligible.ts', { '@/lib/prisma': db, '@/lib/generated/prisma/client': { Prisma: {} }, './generate-verification-code': { generateVerificationCode: () => 'code' } });
    assert.equal((await subject.issueCertificateIfEligible({ userId: 'student', courseId: 'course' })).reason, 'not-complete');
  }
});

test('auth signup config passes deny email protections to the installed Arcjet API', async () => {
  const applied = [];
  const guard = { withRule(rule) { applied.push(rule); return this; }, protect: async () => ({ isDenied: () => false }) };
  const subject = load('app/api/auth/[...all]/route.ts', {
    '@/lib/arcjet': guard,
    '@/lib/auth': { auth: { handler: {}, api: { getSession: async () => null } } },
    '@arcjet/ip': () => '127.0.0.1',
    '@arcjet/next': { protectSignup: (options) => ({ kind: 'signup', options }), detectBot: (options) => ({ kind: 'bot', options }), slidingWindow: (options) => ({ kind: 'rate', options }) },
    'better-auth/next-js': { toNextJsHandler: () => ({ GET: async () => null, POST: async () => 'handled' }) },
  });
  assert.equal(await subject.POST({ headers: {}, nextUrl: { pathname: '/api/auth/sign-up/email' }, clone: () => ({ json: async () => ({ email: 'demo@example.com' }) }) }), 'handled');
  const email = applied.find((rule) => rule.kind === 'signup').options.email;
  assert.equal(email.mode, 'LIVE'); assert.equal(Array.from(email.deny).join(','), 'DISPOSABLE,INVALID,NO_MX_RECORDS'); assert.equal(email.block, undefined);
});
