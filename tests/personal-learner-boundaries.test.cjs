/* eslint-disable @typescript-eslint/no-require-imports -- exercise server modules with node:test infrastructure mocks. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Uint8Array,
    Request,
    Response,
    ReadableStream,
    FormData,
    Headers,
    File,
    URL,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      return require(name);
    },
  }, { filename: file });
  return exports;
}

function learnerAccess({ organization, enrollment }) {
  const lookups = [];
  const helper = load('app/data/user/course-learner-access.ts', {
    '@/lib/prisma': {
      organization: { findUnique: async (query) => { lookups.push(['organization', query]); return organization; } },
      enrollment: { findUnique: async (query) => { lookups.push(['enrollment', query]); return enrollment; } },
    },
  }).getCourseLearnerAccess;
  return { helper, lookups };
}

test('personal course access requires both the workspace owner and an active enrollment', async () => {
  const ownerAccess = learnerAccess({
    organization: { type: 'PERSONAL', ownerUserId: 'learner-a', memberships: [] },
    enrollment: { status: 'Active', accessMode: 'ALL_AT_ONCE' },
  });
  assert.deepEqual(await ownerAccess.helper({ userId: 'learner-a', userRole: 'user', organizationId: 'personal-a', courseId: 'course-a' }), { status: 'Active', accessMode: 'ALL_AT_ONCE' });

  const otherUser = learnerAccess({
    organization: { type: 'PERSONAL', ownerUserId: 'learner-a', memberships: [] },
    enrollment: { status: 'Active', accessMode: 'ALL_AT_ONCE' },
  });
  assert.equal(await otherUser.helper({ userId: 'learner-b', userRole: 'user', organizationId: 'personal-a', courseId: 'course-a' }), null);

  const noEnrollment = learnerAccess({
    organization: { type: 'PERSONAL', ownerUserId: 'learner-a', memberships: [] },
    enrollment: null,
  });
  assert.equal(await noEnrollment.helper({ userId: 'learner-a', userRole: 'user', organizationId: 'personal-a', courseId: 'course-a' }), null);
});

test('personal ownership does not widen existing school membership rules', async () => {
  const student = learnerAccess({
    organization: { type: 'SCHOOL', ownerUserId: null, memberships: [{ role: 'STUDENT' }] },
    enrollment: { status: 'Active', accessMode: 'SEQUENTIAL' },
  });
  assert.deepEqual(await student.helper({ userId: 'student-a', userRole: 'user', organizationId: 'school-a', courseId: 'course-a' }), { status: 'Active', accessMode: 'SEQUENTIAL' });

  const teacher = learnerAccess({
    organization: { type: 'SCHOOL', ownerUserId: null, memberships: [{ role: 'TEACHER' }] },
    enrollment: { status: 'Active', accessMode: 'ALL_AT_ONCE' },
  });
  assert.equal(await teacher.helper({ userId: 'teacher-a', userRole: 'user', organizationId: 'school-a', courseId: 'course-a' }), null);
});

test('learner access scopes organization and enrollment reads to the requesting user and course', async () => {
  const subject = learnerAccess({
    organization: { type: 'PERSONAL', ownerUserId: 'learner-a', memberships: [] },
    enrollment: { status: 'Active', accessMode: 'ALL_AT_ONCE' },
  });
  await subject.helper({ userId: 'learner-a', userRole: 'user', organizationId: 'personal-a', courseId: 'course-a' });
  assert.deepEqual(JSON.parse(JSON.stringify(subject.lookups)), [
    ['organization', { where: { id: 'personal-a' }, select: { type: true, ownerUserId: true, memberships: { where: { userId: 'learner-a' }, select: { role: true }, take: 1 } } }],
    ['enrollment', { where: { userId_courseId: { userId: 'learner-a', courseId: 'course-a' } }, select: { status: true, accessMode: true } }],
  ]);
});

test('existing school course-package import remains a separate teacher-gated endpoint', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app/api/teacher/course-packages/import/route.ts'), 'utf8');
  assert.match(source, /requireTeacher\(\)/);
  assert.match(source, /organizationId/);
  assert.match(source, /canAuthorInOrganization/);
});

function personalImportRoute({ userId = 'learner-a', denied = false, imports = [], organizations = [], githubFetches = [] } = {}) {
  const response = load('app/api/learner/course-packages/import/route.ts', {
    '@/app/data/user/require-user': { requireUser: async () => {
      if (!userId) throw new Error('UNAUTHENTICATED');
      return { user: { id: userId, role: 'user' } };
    } },
    '@/lib/course-package/archive': { COURSE_PACKAGE_MAX_ARCHIVE_BYTES: 8 },
    '@/lib/course-package/github-source': {
      githubRawBundleUrl: (value) => {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('Unsupported GitHub source');
        return parsed.href;
      },
      fetchGithubCourseBundle: async (value) => { githubFetches.push(value); return new Uint8Array([1, 2]); },
    },
    '@/lib/course-package/service': { importCoursePackage: async (input) => {
      imports.push(input);
      if (denied) throw new Error('not permitted');
      return { courseId: `course-${imports.length}`, title: 'Imported Course', slug: 'imported-course', progress: { importedLearners: 0, skippedUnknownLearners: 0, skippedLocations: 0 } };
    } },
    '@/lib/arcjet': { __esModule: true, default: { withRule: () => ({ protect: async () => ({ isDenied: () => false }) }) }, fixedWindow: () => ({}) },
    '@/lib/prisma': { organization: {
      findUnique: async ({ where }) => {
        const found = organizations.find((row) => row.ownerUserId === where.ownerUserId);
        return found ? { id: found.id, type: found.type, slug: found.slug } : null;
      },
      create: async ({ data }) => {
        const created = { id: `personal-${organizations.length + 1}`, ownerUserId: data.ownerUserId, type: data.type, slug: data.slug };
        organizations.push(created);
        return { id: created.id, slug: created.slug };
      },
    } },
  });
  return { POST: response.POST, imports, organizations, githubFetches };
}

function importRequest(form) {
  return new Request('https://school.test/api/learner/course-packages/import', { method: 'POST', body: form });
}

test('personal import requires an authenticated learner before consuming the request', async () => {
  const route = personalImportRoute({ userId: null });
  await assert.rejects(() => route.POST(importRequest(new FormData())), /UNAUTHENTICATED/);
  assert.equal(route.imports.length, 0);
  assert.equal(route.organizations.length, 0);
});

test('personal import accepts exactly one supported source and rejects malformed payloads before writes', async () => {
  const route = personalImportRoute();
  const requests = [];
  requests.push(new Request('https://school.test/api/learner/course-packages/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  requests.push(importRequest(new FormData()));
  const both = new FormData(); both.append('githubUrl', 'https://github.com/acme/course/blob/main/course.s84course'); both.append('file', new File([new Uint8Array([1])], 'course.s84course'));
  requests.push(importRequest(both));
  const extra = new FormData(); extra.append('githubUrl', 'https://github.com/acme/course/blob/main/course.s84course'); extra.append('notes', 'unexpected');
  requests.push(importRequest(extra));
  const duplicate = new FormData(); duplicate.append('githubUrl', 'https://github.com/acme/course/blob/main/course.s84course'); duplicate.append('githubUrl', 'https://github.com/acme/other/blob/main/course.s84course');
  requests.push(importRequest(duplicate));
  const wrongExtension = new FormData(); wrongExtension.append('file', new File([new Uint8Array([1])], 'course.exe'));
  requests.push(importRequest(wrongExtension));
  const tooLarge = new FormData(); tooLarge.append('file', new File([new Uint8Array(9)], 'course.s84course'));
  requests.push(importRequest(tooLarge));

  const statuses = [];
  for (const request of requests) statuses.push((await route.POST(request)).status);
  assert.deepEqual(statuses, [415, 400, 400, 400, 400, 400, 400]);
  assert.equal(route.imports.length, 0);
  assert.equal(route.organizations.length, 0);
  assert.equal(route.githubFetches.length, 0);
});

test('personal import rejects oversized multipart bodies before parsing or creating a workspace', async () => {
  const route = personalImportRoute();
  const request = {
    url: 'https://school.test/api/learner/course-packages/import', method: 'POST',
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(1024 * 1024 + 9) }),
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }),
  };
  assert.equal((await route.POST(request)).status, 413);
  assert.equal(route.imports.length, 0);
  assert.equal(route.organizations.length, 0);
});

test('personal import creates and reuses an owner-only workspace, publishes the course and enrolls its owner', async () => {
  const route = personalImportRoute();
  const makeFileRequest = () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'course.s84course'));
    return importRequest(form);
  };
  const first = await route.POST(makeFileRequest());
  const firstPayload = await first.json();
  assert.equal(first.status, 201);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual(firstPayload.course, { id: 'course-1', title: 'Imported Course', slug: 'imported-course', organizationSlug: 'personal-learner-a' });
  assert.equal(route.organizations.length, 1);
  assert.deepEqual({ ...route.imports[0], bytes: Array.from(route.imports[0].bytes) }, { bytes: [1, 2, 3], organizationId: 'personal-1', userId: 'learner-a', personalLearner: true });

  const second = await route.POST(makeFileRequest());
  assert.equal(second.status, 201);
  assert.equal(route.organizations.length, 1);
  assert.equal(route.imports[1].organizationId, 'personal-1');
  assert.equal(route.imports[1].userId, 'learner-a');
});

test('personal import creates isolated workspaces for different users', async () => {
  const organizations = [];
  const learnerA = personalImportRoute({ organizations, userId: 'learner-a' });
  const learnerB = personalImportRoute({ organizations, userId: 'learner-b' });
  const request = () => {
    const form = new FormData(); form.append('file', new File([new Uint8Array([1])], 'course.s84course'));
    return importRequest(form);
  };
  assert.equal((await learnerA.POST(request())).status, 201);
  assert.equal((await learnerB.POST(request())).status, 201);
  assert.equal(organizations.length, 2);
  assert.deepEqual(organizations.map(({ ownerUserId }) => ownerUserId).sort(), ['learner-a', 'learner-b']);
  assert.notEqual(learnerA.imports[0].organizationId, learnerB.imports[0].organizationId);
});

test('course-package service persists an imported personal course as published and enrolls its owner transactionally', async () => {
  const createdCourses = [];
  const enrollments = [];
  const personalWorkspaceChecks = [];
  const tx = {
    organization: { findFirst: async (query) => { personalWorkspaceChecks.push(query); return { id: 'personal-a' }; } },
    course: {
      findMany: async () => [],
      create: async ({ data }) => {
        createdCourses.push(data);
        return { id: 'course-a', title: data.title, slug: data.slug, courseChapters: [] };
      },
    },
    enrollment: { create: async ({ data }) => { enrollments.push(data); } },
  };
  const subject = load('lib/course-package/service.ts', {
    '@/app/data/course/resolve-categories': { resolveCategories: async () => [] },
    '@/lib/env': { env: { NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: 'test-bucket' } },
    '@/lib/prisma': { $transaction: async (callback) => callback(tx) },
    '@/lib/S3Client': { S3Client: { send: async () => {} } },
    '@aws-sdk/client-s3': {
      GetObjectCommand: class {}, PutObjectCommand: class {}, DeleteObjectsCommand: class {},
    },
    './archive': {
      parseCoursePackageZip: () => ({ manifest: {
        course: { title: 'Local Study Course', description: null, smallDesc: 'Course summary', duration: 20, level: 'BEGINNER', slug: 'local-study-course', priceCents: 0, cover: null, categories: [] },
        chapters: [], assets: [],
      }, assets: new Map() }),
      createCoursePackageZip() {}, sha256() {}, COURSE_PACKAGE_MAX_FILE_BYTES: 1000,
    },
    './schema': { coursePackageManifestSchema: { parse: (value) => value }, courseProgressSchema: { parse: (value) => value } },
  });
  await subject.importCoursePackage({ bytes: new Uint8Array([1]), organizationId: 'personal-a', userId: 'learner-a', personalLearner: true });
  assert.deepEqual(JSON.parse(JSON.stringify(personalWorkspaceChecks)), [{ where: { id: 'personal-a', type: 'PERSONAL', ownerUserId: 'learner-a' }, select: { id: true } }]);
  assert.equal(createdCourses.length, 1);
  assert.equal(createdCourses[0].status, 'PUBLISHED');
  assert.equal(createdCourses[0].organizationId, 'personal-a');
  assert.equal(createdCourses[0].userId, 'learner-a');
  assert.deepEqual(JSON.parse(JSON.stringify(enrollments)), [{ userId: 'learner-a', courseId: 'course-a', amount: 0, status: 'Active', accessMode: 'ALL_AT_ONCE' }]);
});

test('course-package service refuses another learner personal workspace before course or enrollment writes', async () => {
  let courseWrites = 0;
  let enrollmentWrites = 0;
  const tx = {
    organization: { findFirst: async () => null },
    course: { findMany: async () => [], create: async () => { courseWrites++; } },
    enrollment: { create: async () => { enrollmentWrites++; } },
  };
  const subject = load('lib/course-package/service.ts', {
    '@/app/data/course/resolve-categories': { resolveCategories: async () => [] },
    '@/lib/env': { env: { NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: 'test-bucket' } },
    '@/lib/prisma': { $transaction: async (callback) => callback(tx) },
    '@/lib/S3Client': { S3Client: { send: async () => {} } },
    '@aws-sdk/client-s3': { GetObjectCommand: class {}, PutObjectCommand: class {}, DeleteObjectsCommand: class {} },
    './archive': { parseCoursePackageZip: () => ({ manifest: {
      course: { title: 'Local Study Course', description: null, smallDesc: 'Course summary', duration: 20, level: 'BEGINNER', slug: 'local-study-course', priceCents: 0, cover: null, categories: [] }, chapters: [], assets: [],
    }, assets: new Map() }), createCoursePackageZip() {}, sha256() {}, COURSE_PACKAGE_MAX_FILE_BYTES: 1000 },
    './schema': { coursePackageManifestSchema: { parse: (value) => value }, courseProgressSchema: { parse: (value) => value } },
  });
  await assert.rejects(() => subject.importCoursePackage({ bytes: new Uint8Array([1]), organizationId: 'personal-owned-by-b', userId: 'learner-a', personalLearner: true }), /Personal workspace import is not authorized/);
  assert.equal(courseWrites, 0);
  assert.equal(enrollmentWrites, 0);
});

test('personal import accepts a GitHub bundle URL and does not expose import internals on failure', async () => {
  const route = personalImportRoute({ denied: true });
  const form = new FormData(); form.append('githubUrl', 'https://github.com/acme/course/blob/main/course.s84course');
  const response = await route.POST(importRequest(form));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error.includes('not permitted'), false);
  assert.deepEqual(route.githubFetches, ['https://github.com/acme/course/blob/main/course.s84course']);
  assert.equal(route.imports[0].personalLearner, true);
});

test('personal import rejects an untrusted GitHub source before fetching or creating a workspace', async () => {
  const route = personalImportRoute();
  const form = new FormData(); form.append('githubUrl', 'https://github.com.evil.test/acme/course/blob/main/course.s84course');
  assert.equal((await route.POST(importRequest(form))).status, 400);
  assert.equal(route.githubFetches.length, 0);
  assert.equal(route.imports.length, 0);
  assert.equal(route.organizations.length, 0);
});

test('public catalog queries school courses only, including tenant-scoped catalogs', async () => {
  let captured;
  const subject = load('app/data/course/get-all-courses.ts', {
    '@/lib/prisma': { course: {
      count: async ({ where }) => { captured = where; return 0; },
      findMany: async () => [],
    }, courseReview: { groupBy: async () => [] } },
    '@/lib/pagination': { normalizePagination: () => ({ page: 1, pageSize: 12, skip: 0, take: 12 }) },
    '@/lib/s3/get-download-url': { getDownloadUrls: async () => [] },
  });
  await subject.getCoursesPage();
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), { status: 'PUBLISHED', organization: { type: 'SCHOOL' } });
  await subject.getCoursesPage({ organizationSlug: 'school-a' });
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), { status: 'PUBLISHED', organization: { type: 'SCHOOL', slug: 'school-a' } });
});

test('public course detail lookup cannot resolve a personal workspace course by slug', async () => {
  let captured;
  const subject = load('app/data/course/get-course-by-slug.ts', {
    '@/lib/prisma': { course: { findMany: async ({ where }) => { captured = where; return []; } } },
    '@/lib/s3/get-download-url': { getDownloadUrl: async () => null },
    'next/navigation': { notFound() { throw Error('NOT_FOUND'); } },
  });
  await assert.rejects(() => subject.getCourseBySlug('my-course'), /NOT_FOUND/);
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), { slug: 'my-course', organization: { type: 'SCHOOL' } });
});

test('learner enrollment list includes owned personal courses while binding enrollment to the signed-in user', async () => {
  let captured;
  const subject = load('app/data/user/get-my-enrolled-courses.ts', {
    '@/lib/prisma': {
      enrollment: { findMany: async ({ where }) => { captured = where; return []; } },
      learningCursor: { findMany: async () => [] },
    },
    '@/lib/s3/get-download-url': { getDownloadUrls: async () => [] },
    '@/lib/course-access': { canAccessAssignedLesson: async () => true },
    './require-user': { requireUser: async () => ({ user: { id: 'learner-a', role: 'user' } }) },
    '@/app/dashboard/_lib/resolve-learning-target': { resolveLearningTarget: () => ({ lessonId: null, cellId: null, hasStarted: false }) },
  });
  assert.equal((await subject.getMyEnrolledCourses()).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), {
    userId: 'learner-a', status: 'Active',
    course: { organization: { OR: [
      { type: 'SCHOOL', memberships: { some: { userId: 'learner-a', role: 'STUDENT' } } },
      { type: 'PERSONAL', ownerUserId: 'learner-a' },
    ] } },
  });
});

test('learning course lookup binds personal ownership and active enrollment to the signed-in learner', async () => {
  let captured;
  const subject = load('app/data/user/get-course-for-learning.ts', {
    '@/lib/prisma': { course: { findMany: async ({ where }) => { captured = where; return []; } } },
    '@/lib/s3/get-download-url': { getDownloadUrl: async () => null },
    '@/lib/course-access': { getSequentiallyUnlockedLessonIds: () => new Set() },
    '@/app/dashboard/_lib/resolve-learning-target': { resolveLearningTarget: () => ({ lessonId: null, cellId: null, hasStarted: false }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-a', role: 'user' } }) },
    './require-user': { requireUser: async () => ({ user: { id: 'learner-a', role: 'user' } }) },
    'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error(`REDIRECT:${url}`); } },
  });
  await assert.rejects(() => subject.getCourseForLearning({ slug: 'my-course' }), /NOT_FOUND/);
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), {
    slug: 'my-course',
    organization: { OR: [
      { type: 'SCHOOL', memberships: { some: { userId: 'learner-a', role: 'STUDENT' } } },
      { type: 'PERSONAL', ownerUserId: 'learner-a' },
    ] },
    enrollment: { some: { userId: 'learner-a', status: 'Active' } },
  });
});

test('published personal courses cannot be added to the public wishlist', async () => {
  let wishlistWrites = 0;
  const subject = load('app/(public)/courses/[slug]/_components/wishlist-actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/generated/prisma/client': { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    '@/lib/arcjet': { __esModule: true, default: { withRule: () => ({ protect: async () => ({ isDenied: () => false }) }) }, fixedWindow: () => ({}) },
    '@arcjet/next': { request: async () => ({}) },
    '@/lib/responses': { errorResponse: (message) => ({ status: 'error', message }), successResponse: (message, data) => ({ status: 'success', message, data }) },
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-b', role: 'user' } }) },
    '@/lib/prisma': { course: { findUnique: async () => ({ id: 'personal-course', slug: 'private-course', status: 'PUBLISHED', organization: { type: 'PERSONAL' } }) }, wishlistItem: { create: async () => { wishlistWrites++; } } },
  });
  const result = await subject.addToWishlistAction({ courseId: 'personal-course' });
  assert.equal(result.status, 'error');
  assert.equal(wishlistWrites, 0);
});

test('personal workspace courses never appear in a learner public wishlist', async () => {
  const queries = [];
  const subject = load('app/data/user/get-wishlist-courses.ts', {
    '@/lib/prisma': {
      wishlistItem: {
        findMany: async ({ where }) => { queries.push(where); return []; },
        count: async ({ where }) => { queries.push(where); return 0; },
      },
    },
    '@/lib/constants/wishlist': { WISHLIST_PAGE_SIZE: 12 },
    '@/lib/pagination': { normalizePagination: () => ({ page: 1, pageSize: 12, skip: 0, take: 12 }) },
    '@/lib/s3/get-download-url': { getDownloadUrls: async () => [] },
    './require-user': { requireUser: async () => ({ user: { id: 'learner-b', role: 'user' } }) },
  });
  const result = await subject.getMyWishlistCourses({});
  assert.equal(result.items.length, 0);
  assert.equal(queries.length, 2);
  for (const where of queries) assert.deepEqual(JSON.parse(JSON.stringify(where)), { userId: 'learner-b', course: { status: 'PUBLISHED', organization: { type: 'SCHOOL' } } });
});

test('wishlist state APIs only report school courses', async () => {
  const queries = [];
  const subject = load('app/data/course/get-wishlist-state.ts', {
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: 'learner-a' } }) } } },
    'next/headers': { headers: async () => new Headers() },
    '@/lib/prisma': { wishlistItem: {
      findMany: async ({ where }) => { queries.push(where); return [{ courseId: 'school-course' }]; },
      findFirst: async ({ where }) => { queries.push(where); return null; },
    } },
  });
  assert.deepEqual([...await subject.getWishlistedCourseIds()], ['school-course']);
  assert.equal(await subject.isCourseWishlisted({ courseId: 'personal-course', userId: 'learner-a' }), false);
  assert.deepEqual(JSON.parse(JSON.stringify(queries)), [
    { userId: 'learner-a', course: { organization: { type: 'SCHOOL' } } },
    { userId: 'learner-a', courseId: 'personal-course', course: { organization: { type: 'SCHOOL' } } },
  ]);
});

test('personal workspace courses cannot be reviewed or used to edit a public review', async () => {
  let reviewCreates = 0;
  let reviewUpdates = 0;
  let learnerAccessChecks = 0;
  const responseMocks = { errorResponse: (message) => ({ status: 'error', message }), successResponse: (message, data) => ({ status: 'success', message, data }) };
  const shared = {
    'next/cache': { revalidatePath() {} },
    '@/lib/generated/prisma/client': { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    '@/lib/arcjet': { __esModule: true, default: { withRule: () => ({ protect: async () => ({ isDenied: () => false }) }) }, fixedWindow: () => ({}) },
    '@arcjet/next': { request: async () => ({}) },
    '@/lib/responses': responseMocks,
    '@/app/data/user/require-user': { requireUser: async () => ({ user: { id: 'learner-a', role: 'user' } }) },
    '@/app/data/user/course-learner-access': { getCourseLearnerAccess: async () => { learnerAccessChecks++; return { status: 'Active', accessMode: 'ALL_AT_ONCE' }; } },
  };
  const subject = load('app/(public)/courses/[slug]/_components/review-actions.ts', {
    ...shared,
    '@/lib/prisma': {
      course: { findUnique: async () => ({ id: 'personal-course', slug: 'private-course', status: 'PUBLISHED', organizationId: 'personal-a', organization: { type: 'PERSONAL' } }) },
      courseReview: {
        create: async () => { reviewCreates++; },
        findUnique: async () => ({ id: 'existing-review', userId: 'learner-a', courseId: 'personal-course', course: { slug: 'private-course', status: 'PUBLISHED', organizationId: 'personal-a', organization: { type: 'PERSONAL' } } }),
        update: async () => { reviewUpdates++; },
      },
    },
  });
  const submit = await subject.submitReviewAction({ courseId: 'personal-course', rating: 5, comment: 'This is a valid review.' });
  assert.equal(submit.status, 'error');
  const edit = await subject.editReviewAction({ reviewId: 'existing-review', rating: 4, comment: 'This is an edited review.' });
  assert.equal(edit.status, 'error');
  assert.equal(reviewCreates, 0);
  assert.equal(reviewUpdates, 0);
  assert.equal(learnerAccessChecks, 0);
});
