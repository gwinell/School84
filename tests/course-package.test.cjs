/* eslint-disable @typescript-eslint/no-require-imports -- exercise the TypeScript archive service with node:test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fflate = require('fflate');
const crypto = require('node:crypto');

function load(file, cache = {}, mocks = {}) {
  if (cache[file]) return cache[file];
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  cache[file] = exports;
  vm.runInNewContext(code, {
    exports,
    Uint8Array,
    URL,
    TextDecoder,
    Request,
    Response,
    ReadableStream,
    FormData,
    Headers,
    File,
    Buffer,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      if (name === 'fflate') return fflate;
      if (name === 'node:crypto') return crypto;
      if (name === 'zod') return require('zod');
      if (name === './schema') return load('lib/course-package/schema.ts', cache);
      if (name === './archive') return load('lib/course-package/archive.ts', cache);
      return require(name);
    },
  }, { filename: file });
  return exports;
}

const { createCoursePackageZip, parseCoursePackageZip, sha256 } = load('lib/course-package/archive.ts');
const asset = new Uint8Array([1, 2, 3, 4]);
const assetPath = 'assets/abcd1234.png';
function manifest() {
  return {
    format: 'school84.course', formatVersion: 1,
    course: { title: 'Пробный курс', description: 'Описание', smallDesc: 'Коротко', priceCents: 1234, duration: 60, level: 'BEGINNER', slug: 'probnyi-kurs', categories: ['Python'], cover: assetPath },
    chapters: [{ title: 'Глава', position: 1, lessons: [{
      title: 'Урок', description: null, video: null, position: 1,
      legacyQuiz: { questions: [{ text: 'Старый вопрос?', type: 'SINGLE', position: 1, answers: [{ text: 'Да', isCorrect: true, explanation: null, position: 1 }, { text: 'Нет', isCorrect: false, explanation: null, position: 2 }] }] },
      cells: [
        { type: 'TEXT', position: 1, title: 'Материал', textContent: JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { key: assetPath, src: assetPath } }] }) },
        { type: 'CODE_TASK', position: 2, title: 'Python', taskPrompt: 'Задача', starterCode: 'print(1)', examples: [{ input: '', output: '1' }], testCases: [{ input: '', output: '1' }], lintConfig: { language: 'python', linters: ['ruff'], checkerCode: 'assert output == "1"' } },
        { type: 'CODE_TASK', position: 3, title: 'JavaScript', taskPrompt: 'Задача', starterCode: 'console.log(1)', examples: [], testCases: [{ input: '', output: '1' }], lintConfig: { language: 'javascript', linters: [], checkerCode: 'assert.equal(actual, "1")' } },
        { type: 'QUIZ', position: 4, title: 'Новый тест', quiz: { questions: [{ text: 'Вопрос?', type: 'MULTIPLE', position: 1, answers: [{ text: 'A', isCorrect: true, explanation: 'ok', position: 1 }, { text: 'B', isCorrect: true, explanation: null, position: 2 }] }] } },
      ],
    }] }],
    assets: [{ path: assetPath, contentType: 'image/png', size: asset.length, sha256: sha256(asset) }],
    settings: { grading: { standardInputOutput: true, authorChecks: true } },
  };
}

test('package archive round-trips versioned manifest, both quiz shapes, media, prices and both language checkerCode', () => {
  const input = manifest();
  const bundle = createCoursePackageZip({ manifest: input, assets: new Map([[assetPath, asset]]) });
  const decoded = parseCoursePackageZip(bundle);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.manifest)), input);
  assert.deepEqual([...decoded.assets.get(assetPath)], [...asset]);
  assert.equal(decoded.manifest.chapters[0].lessons[0].legacyQuiz.questions[0].answers[0].isCorrect, true);
  assert.equal(decoded.manifest.chapters[0].lessons[0].cells[2].lintConfig.language, 'javascript');
  assert.equal(decoded.manifest.course.priceCents, 1234);
});

test('progress is an optional separate archive member and contains only email and completion state', () => {
  const progress = { format: 'school84.course-progress', formatVersion: 1, learners: [{ email: 'a@example.test', lessonCompletion: [{ chapterPosition: 1, lessonPosition: 1, completed: true }], cells: [{ chapterPosition: 1, lessonPosition: 1, cellPosition: 2, status: 'PASSED', attempts: 3 }] }] };
  const bundle = createCoursePackageZip({ manifest: manifest(), assets: new Map([[assetPath, asset]]), progress });
  const decoded = parseCoursePackageZip(bundle);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.progress)), progress);
  assert.equal(JSON.stringify(decoded.progress).includes('sourceCode'), false);
  assert.equal(JSON.stringify(decoded.progress).includes('selectedAnswers'), false);
});

test('progress rejects duplicate learner identities case-insensitively', () => {
  const progress = { format: 'school84.course-progress', formatVersion: 1, learners: [
    { email: 'A@example.test', lessonCompletion: [], cells: [] },
    { email: 'a@example.test', lessonCompletion: [], cells: [] },
  ] };
  assert.throws(() => createCoursePackageZip({ manifest: manifest(), assets: new Map([[assetPath, asset]]), progress }), /duplicate learner email/i);
});

test('rejects an unsupported manifest version and undeclared archive members', () => {
  const invalid = manifest(); invalid.formatVersion = 2;
  assert.throws(() => createCoursePackageZip({ manifest: invalid, assets: new Map([[assetPath, asset]]) }));
  const files = { 'manifest.json': Buffer.from(JSON.stringify(manifest())), [assetPath]: asset, 'notes.txt': Buffer.from('unexpected') };
  assert.throws(() => parseCoursePackageZip(fflate.zipSync(files)), /unsupported archive path|undeclared files/i);
});

test('rejects zip-slip and hidden/dot paths before extraction', () => {
  for (const hostile of ['../manifest.json', '/manifest.json', 'assets/../../escape.png', 'assets/.hidden.png', 'assets\\escape.png']) {
    const bundle = fflate.zipSync({ [hostile]: Buffer.from('{}') });
    assert.throws(() => parseCoursePackageZip(bundle), /unsafe|unsupported archive path/i, hostile);
  }
});

test('rejects an inflated-size zip bomb using central directory metadata before decompression', () => {
  const bytes = fflate.zipSync({ 'manifest.json': Buffer.from('{}') });
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const central = Buffer.from(bytes).indexOf(signature);
  assert.notEqual(central, -1);
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).writeUInt32LE(101 * 1024 * 1024, central + 24);
  assert.throws(() => parseCoursePackageZip(bytes), /too large/i);
});

test('rejects oversized manifest and progress members before JSON parsing', () => {
  for (const name of ['manifest.json', 'progress.json']) {
    const bytes = fflate.zipSync({ [name]: Buffer.from('{}') });
    const central = Buffer.from(bytes).indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.notEqual(central, -1);
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).writeUInt32LE(17 * 1024 * 1024, central + 24);
    assert.throws(() => parseCoursePackageZip(bytes), /manifest is too large|progress is too large/i, name);
  }
});

test('GitHub URL normalization only accepts HTTPS file hosts and paths', () => {
  const github = load('lib/course-package/github-source.ts');
  assert.equal(github.githubRawBundleUrl('https://github.com/acme/course/blob/main/course.s84course'), 'https://raw.githubusercontent.com/acme/course/main/course.s84course');
  assert.equal(github.githubRawBundleUrl('https://raw.githubusercontent.com/acme/course/main/course.s84course'), 'https://raw.githubusercontent.com/acme/course/main/course.s84course');
  for (const url of [
    'http://github.com/acme/course/blob/main/course.s84course',
    'https://github.com.evil.test/acme/course/blob/main/course.s84course',
    'https://github.com/acme/course/blob/main/../../secret',
    'https://127.0.0.1/course',
    'https://user:pass@github.com/acme/course/blob/main/course.s84course',
  ]) assert.throws(() => github.githubRawBundleUrl(url));
});

test('package import rejects an author outside the selected organization before reading bundle source', async () => {
  let organizationChecks = 0;
  let packageImports = 0;
  const route = load('app/api/teacher/course-packages/import/route.ts', {}, {
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'teacher-a', role: 'teacher' } }) },
    '@/lib/prisma': { organizationMembership: { findUnique: async () => { organizationChecks++; return null; } } },
    '@/lib/course-package/archive': { COURSE_PACKAGE_MAX_ARCHIVE_BYTES: 125 * 1024 * 1024 },
    '@/lib/course-package/github-source': { fetchGithubCourseBundle: async () => { throw Error('should not fetch'); }, readBoundedBody: async (request) => new Uint8Array(await request.arrayBuffer()) },
    '@/lib/course-package/service': { importCoursePackage: async () => { packageImports++; } },
  });
  const body = new FormData(); body.append('organizationId', 'clh1234567890123456789012'); body.append('githubUrl', 'https://github.com/acme/course/blob/main/course.s84course');
  const response = await route.POST(new Request('https://school.test/api/teacher/course-packages/import', { method: 'POST', body }));
  assert.equal(response.status, 403);
  assert.equal(organizationChecks, 1);
  assert.equal(packageImports, 0);
});

test('package import does not return database or infrastructure exception details', async () => {
  const route = load('app/api/teacher/course-packages/import/route.ts', {}, {
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'admin-a', role: 'admin' } }) },
    '@/lib/prisma': { organization: { findUnique: async () => ({ id: 'clh1234567890123456789012' }) } },
    '@/lib/course-package/archive': { COURSE_PACKAGE_MAX_ARCHIVE_BYTES: 125 * 1024 * 1024 },
    '@/lib/course-package/github-source': { fetchGithubCourseBundle: async () => { throw Error('should not fetch'); }, readBoundedBody: async (request) => new Uint8Array(await request.arrayBuffer()) },
    '@/lib/course-package/service': { importCoursePackage: async () => { throw new Error('postgres://secret.internal/database'); } },
  });
  const body = new FormData(); body.append('organizationId', 'clh1234567890123456789012'); body.append('includeProgress', 'false'); body.append('file', new File([new Uint8Array([1, 2, 3])], 'course.s84course'));
  const response = await route.POST(new Request('https://school.test/api/teacher/course-packages/import', { method: 'POST', body }));
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.includes('secret.internal'), false);
});

test('package import rejects an oversized multipart Content-Length before reading the body', async () => {
  const route = load('app/api/teacher/course-packages/import/route.ts', {}, {
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'admin-a', role: 'admin' } }) },
    '@/lib/prisma': { organization: { findUnique: async () => ({ id: 'clh1234567890123456789012' }) } },
    '@/lib/course-package/archive': { COURSE_PACKAGE_MAX_ARCHIVE_BYTES: 100 * 1024 * 1024 },
    '@/lib/course-package/github-source': {},
    '@/lib/course-package/service': { importCoursePackage: async () => { throw new Error('must not import'); } },
  });
  const request = {
    url: 'https://school.test/api/teacher/course-packages/import', method: 'POST',
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(102 * 1024 * 1024) }),
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }),
  };
  const response = await route.POST(request);
  assert.equal(response.status, 413);
});

test('package imports are serialized to keep concurrent archive parsing within the app memory budget', async () => {
  let markImportStarted;
  const importStarted = new Promise((resolve) => { markImportStarted = resolve; });
  let finishImport;
  const importGate = new Promise((resolve) => { finishImport = resolve; });
  const route = load('app/api/teacher/course-packages/import/route.ts', {}, {
    '@/app/data/teacher/require-teacher': { requireTeacher: async () => ({ user: { id: 'admin-a', role: 'admin' } }) },
    '@/lib/prisma': { organization: { findUnique: async () => ({ id: 'clh1234567890123456789012' }) } },
    '@/lib/course-package/archive': { COURSE_PACKAGE_MAX_ARCHIVE_BYTES: 100 * 1024 * 1024 },
    '@/lib/course-package/github-source': {},
    '@/lib/course-package/service': { importCoursePackage: async () => { markImportStarted(); return importGate; } },
  });
  const makeRequest = () => {
    const body = new FormData();
    body.append('organizationId', 'clh1234567890123456789012');
    body.append('file', new File([new Uint8Array([1])], 'course.s84course'));
    return new Request('https://school.test/api/teacher/course-packages/import', { method: 'POST', body });
  };
  const first = route.POST(makeRequest());
  await importStarted;
  const second = await route.POST(makeRequest());
  assert.equal(second.status, 429);
  finishImport({ courseId: 'course-1', title: 'Курс', slug: 'course', progress: { importedLearners: 0, skippedUnknownLearners: 0, skippedLocations: 0 } });
  assert.equal((await first).status, 201);
});

test('course package export checks course authorization before serialization', async () => {
  let exports = 0;
  const route = load('app/api/teacher/courses/[courseId]/package/route.ts', {}, {
    '@/app/data/teacher/require-course-teacher': { requireCourseTeacher: async () => { throw new Error('DENIED'); } },
    '@/lib/course-package/service': { exportCoursePackage: async () => { exports++; return new Uint8Array(); } },
  });
  await assert.rejects(() => route.GET(new Request('https://school.test/api/teacher/courses/course-secret/package'), { params: Promise.resolve({ courseId: 'course-secret' }) }), /DENIED/);
  assert.equal(exports, 0);
});
