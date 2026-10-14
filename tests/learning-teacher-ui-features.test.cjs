/* eslint-disable @typescript-eslint/no-require-imports -- render the real UI components with lightweight hook mocks. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sourceRoot = process.env.FEATURE_SOURCE_ROOT || path.join(__dirname, '..');

function load(file, overrides = {}, globals = {}) {
  const state = [];
  const pending = [];
  let cursor = 0;
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useTransition: () => [false, (callback) => { pending.push(callback()); }],
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': { default: 'Link' },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/hooks/try-catch': { tryCatch: async (promise) => {
      try { return { data: await promise, error: null }; }
      catch (error) { return { data: null, error }; }
    } },
    sonner: { toast: { error() {}, success() {}, info() {} } },
    '@/components/ui/badge': { Badge: 'Badge' },
    '@/components/ui/button': { Button: 'Button', buttonVariants: () => 'button' },
    '@/components/ui/input': { Input: 'Input' },
    '@/components/ui/textarea': { Textarea: 'Textarea' },
    '@/components/ui/card': { Card: 'Card', CardContent: 'CardContent', CardHeader: 'CardHeader', CardTitle: 'CardTitle' },
    '@/lib/organization/course-links': { dashboardCourseHref: (organizationSlug, slug, lessonId) => `/dashboard/schools/${encodeURIComponent(organizationSlug)}/courses/${encodeURIComponent(slug)}${lessonId ? `/${encodeURIComponent(lessonId)}` : ''}` },
    '@/components/general/CourseImage': { CourseImage: 'CourseImage' },
    ...overrides,
  };
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, Date, Set, Map, Object,
    require: (name) => modules[name] ?? new Proxy({}, { get: (_, property) => String(property) }),
    ...globals,
  }, { filename: file });
  return {
    exports, state,
    render(name, props) { cursor = 0; return exports[name](props); },
    flush: async () => { await Promise.all(pending.splice(0)); },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, predicate) => {
  const node = nodes(tree).find(predicate);
  assert.ok(node, 'Expected UI element was not rendered');
  return node;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const submit = (form) => form.props.onSubmit({ preventDefault() {} });
const text = (tree) => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join(' ')
    : tree && typeof tree === 'object' ? text(tree.props?.children) : '';

test('Continue link resumes the saved lesson and cell and safely encodes URL values', () => {
  const links = load('app/dashboard/_lib/learning-links.ts');
  assert.equal(links.exports.getLearningLocationHref({ slug: 'course one', lessonId: 'lesson/2', cellId: 'cell 3' }),
    '/dashboard/courses/course%20one/lesson%2F2?cellId=cell%203');
  assert.equal(links.exports.getLearningLocationHref({ slug: 'course-one', lessonId: null, cellId: 'ignored' }),
    '/dashboard/courses/course-one');

  const card = load('app/dashboard/_components/EnrolledCourseCard.tsx', {
    '@/app/dashboard/_lib/learning-links': links.exports,
  });
  const course = { id: 'course-1', slug: 'python', organizationSlug: 'lyceum-5', title: 'Python', smallDesc: '', imageUrl: null, level: 'BEGINNER', duration: 30, chaptersCount: 1, lessonsCount: 2, completedCount: 0, hasStarted: true, resumeLessonId: 'lesson-2', resumeCellId: 'cell-4' };
  const link = find(card.render('EnrolledCourseCard', { course }), (node) => node.type === 'Link' && node.props.children?.[0] === 'Продолжить');
  assert.equal(link.props.href, '/dashboard/schools/lyceum-5/courses/python/lesson-2?cellId=cell-4');
  assert.equal(link.props.children[0], 'Продолжить');
  assert.match(text(card.render('EnrolledCourseCard', { course })), /0\s+из\s+2\s+урока/);
});

test('learner sidebar offers each membership school and teaching access even when the global role is regular user', () => {
  const h = load('app/dashboard/_components/DashboardSidebar.tsx', {
    'next/navigation': { usePathname: () => '/dashboard' },
    '@/components/brand': { Brand: 'Brand' },
  });
  const schoolProps = [
    { name: 'Лицей 5', slug: 'lyceum-5', logoUrl: null, primaryColor: '#124a73' },
    { name: 'Школа № 42', slug: 'school 42', logoUrl: '/school.svg', primaryColor: null },
  ];
  const tree = h.render('DashboardSidebar', {
    role: 'user', hasTeachingAccess: true,
    schools: schoolProps,
  });
  const schoolNav = h.render('SchoolNavigation', { schools: schoolProps, pathname: '/dashboard' });
  const buttons = nodes(schoolNav).filter((node) => node.type === 'SidebarMenuButton');
  const hrefs = buttons.map((node) => node.props.render?.props?.href).filter(Boolean);
  assert.ok(hrefs.includes('/schools/lyceum-5/courses'));
  assert.ok(hrefs.includes('/schools/school%2042/courses'));
  const nav = find(tree, (node) => node.type?.name === 'NavMain');
  assert.ok(nav.props.items.some((item) => item.url === '/teacher' && item.title === 'Преподавание'));
  assert.ok(nav.props.items.some((item) => item.url === '/dashboard/schools' && item.title === 'Мои школы'));
  assert.match(text(schoolNav), /Школы/);
});

test('school management issues the selected role invite, exposes a copyable one-time link, and limits admin invite option to owners', async () => {
  const invites = [];
  const copied = [];
  const h = load('app/dashboard/schools/_components/SchoolManagement.tsx', {
    '@/app/data/organization/actions': {
      createOrganization: async () => ({ status: 'success', message: 'created' }),
      createOrganizationInvitation: async (input) => { invites.push(input); return { status: 'success', message: 'created', data: { inviteUrl: 'https://school.example.test/school-invite/token' } }; },
      removeOrganizationMember: async () => ({ status: 'success' }),
      updateOrganizationMemberRole: async () => ({ status: 'success' }),
    },
    '@/components/brand': { Brand: 'Brand' },
    sonner: { toast: { error() {}, success() {} } },
  }, { navigator: { clipboard: { writeText: async (url) => copied.push(url) } }, window: { location: { reload() {} } } });
  const schools = [
    { id: 'owner-school', name: 'Лицей 5', slug: 'lyceum-5', logoUrl: null, primaryColor: null, role: 'OWNER', members: [] },
    { id: 'admin-school', name: 'Школа 42', slug: 'school-42', logoUrl: null, primaryColor: null, role: 'ADMIN', members: [] },
  ];
  let tree = h.render('SchoolManagement', { schools });
  const ownerRole = find(tree, (node) => node.type === 'select' && node.props.id === 'invite-role-owner-school');
  assert.match(text(ownerRole), /Администратор/);
  const adminRole = find(tree, (node) => node.type === 'select' && node.props.id === 'invite-role-admin-school');
  assert.doesNotMatch(text(adminRole), /Администратор/);
  const emailInput = find(tree, (node) => node.type === 'Input' && node.props.id === 'invite-email-owner-school');
  emailInput.props.onChange({ target: { value: ' Teacher@Example.test ' } });
  ownerRole.props.onChange({ target: { value: 'TEACHER' } });
  tree = h.render('SchoolManagement', { schools });
  const inviteForm = nodes(tree).find((node) => node.type === 'form' && nodes(node).some((child) => child.props?.id === 'invite-email-owner-school'));
  submit(inviteForm);
  await h.flush();
  assert.deepEqual(plain(invites), [{ organizationId: 'owner-school', email: 'teacher@example.test', role: 'TEACHER' }]);
  tree = h.render('SchoolManagement', { schools });
  const inviteUrl = find(tree, (node) => node.type === 'Input' && node.props['aria-label'] === 'Ссылка приглашения');
  assert.equal(inviteUrl.props.value, 'https://school.example.test/school-invite/token');
  await find(tree, (node) => node.type === 'Button' && text(node).includes('Копировать ссылку')).props.onClick();
  assert.deepEqual(copied, ['https://school.example.test/school-invite/token']);
});

test('teacher course cards identify their school and open its tenant-specific course catalogue', async () => {
  const courses = [{ id: 'course-a', title: 'Алгебра', slug: 'algebra', status: 'PUBLISHED', organization: { id: 'school-a', name: 'Лицей 5', slug: 'lyceum-5', logoUrl: '/lyceum.svg', primaryColor: '#123456' } }];
  const h = load('app/teacher/page.tsx', {
    '@/app/data/teacher/get-course-gradebook': { adminGetTeachingCourses: async () => courses },
    '@/components/brand': { Brand: 'Brand' },
  });
  const tree = await h.render('default', {});
  const schoolBrand = find(tree, (node) => node.type === 'Brand' && node.props.brand?.slug === 'lyceum-5');
  assert.equal(schoolBrand.props.brand.name, 'Лицей 5');
  assert.ok(nodes(tree).some((node) => node.type === 'Link' && node.props.href === '/schools/lyceum-5/courses'));
});

test('saved learning target is shared, preserves an open cell, and rejects a now-locked cursor', () => {
  const resolver = load('app/dashboard/_lib/resolve-learning-target.ts').exports.resolveLearningTarget;
  const lessons = [
    { id: 'lesson-1', completed: true, isUnlocked: true, cells: [{ id: 'cell-1', status: 'PASSED' }] },
    { id: 'lesson-2', completed: false, isUnlocked: true, cells: [
      { id: 'cell-2', status: 'PASSED' }, { id: 'cell-3', status: 'IN_PROGRESS' },
    ] },
    { id: 'lesson-3', completed: false, isUnlocked: false, cells: [{ id: 'cell-4', status: 'LOCKED' }] },
  ];
  assert.deepEqual(plain(resolver(lessons, { lessonId: 'lesson-2', cellId: 'cell-3' })), {
    lessonId: 'lesson-2', cellId: 'cell-3', hasStarted: true,
  });
  assert.deepEqual(plain(resolver(lessons, { lessonId: 'lesson-3', cellId: 'cell-4' })), {
    lessonId: 'lesson-2', cellId: 'cell-3', hasStarted: true,
  });
  assert.deepEqual(plain(resolver([{ id: 'lesson-1', completed: false, cells: [{ id: 'cell-1' }] }], null)), {
    lessonId: 'lesson-1', cellId: 'cell-1', hasStarted: false,
  });
});

test('course overview Continue button resumes the saved cell as well as the lesson', () => {
  const links = load('app/dashboard/_lib/learning-links.ts').exports;
  const header = load('app/dashboard/courses/[slug]/_components/CourseOverviewHeader.tsx', {
    '@/app/dashboard/_lib/learning-links': links,
  });
  const tree = header.render('CourseOverviewHeader', {
    slug: 'python', title: 'Python', smallDesc: '', imageUrl: null,
    resumeLessonId: 'lesson-2', resumeCellId: 'cell-3', hasStarted: true,
  });
  const continueButton = find(tree, (node) => node.type === 'Button' && node.props.render?.props?.href?.includes('/lesson-2'));
  assert.equal(continueButton.props.render.props.href, '/dashboard/courses/python/lesson-2?cellId=cell-3');
});

test('bulk course invitations normalize addresses and show generic delivery plus manual links', async () => {
  const calls = [];
  const toastMessages = [];
  let refreshCount = 0;
  const h = load('app/teacher/_components/CourseRosterManager.tsx', {
    '@/components/ui/badge': { Badge: 'Badge' },
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshCount += 1; } }) },
    sonner: { toast: { error() {}, info() {}, success: (message) => toastMessages.push(message) } },
  });
  const props = { courseId: 'course-1', enrollments: [],
    onInvite: async () => ({ status: 'success', data: { inviteUrl: null, alreadyAssigned: false } }),
    onBulkInvite: async (value) => { calls.push(value); return { status: 'success', message: 'Запрос обработан. Приглашения отправлены или подготовлены для передачи.', data: { requested: 2, invalidCount: 0, sent: 1, failed: 1, emailDelivery: 'partial', manualInvites: [{ email: 'b@example.test', inviteUrl: 'https://school.example.test/invite/token' }] } }; },
    onCancel: async () => ({ status: 'success' }), onSetDueDate: async () => ({ status: 'success' }),
  };
  let tree = h.render('CourseRosterManager', props);
  const form = find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Пригласить учеников списком');
  const textarea = find(form, (node) => node.type === 'Textarea');
  textarea.props.onChange({ target: { value: ' A@Example.test, a@example.test\nB@Example.test; ' } });
  tree = h.render('CourseRosterManager', props);
  submit(find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Пригласить учеников списком'));
  await h.flush();
  assert.deepEqual(plain(calls), [{ courseId: 'course-1', accessMode: 'ALL_AT_ONCE', dueAt: null, emails: ['a@example.test', 'b@example.test'] }]);
  const status = find(h.render('CourseRosterManager', props), (node) => node.props.role === 'status');
  assert.match(text(status), /Адресов: 2; отправлено: 1; требуется передать вручную: 1/);
  assert.doesNotMatch(text(status), /не найдены|уже назначены|добавлено|аккаунт существует/i);
  assert.equal(find(h.render('CourseRosterManager', props), (node) => node.props['aria-label'] === 'Ссылка приглашения: b@example.test').props.value, 'https://school.example.test/invite/token');
  assert.deepEqual(toastMessages, ['Запрос обработан. Приглашения отправлены или подготовлены для передачи.']);
  assert.equal(refreshCount, 1, 'the invitation roster refreshes after the batch succeeds');
  const formText = text(find(h.render('CourseRosterManager', props), (node) => node.type === 'form' && node.props['aria-label'] === 'Пригласить учеников списком'));
  assert.match(formText, /Приглашения по списку/);
  assert.match(formText, /после принятия приглашения/);
  assert.doesNotMatch(formText, /Массовое назначение/);
});

test('single invitation refreshes the roster and keeps the manual invite link visible', async () => {
  const calls = [];
  const toastMessages = [];
  let refreshCount = 0;
  const h = load('app/teacher/_components/CourseRosterManager.tsx', {
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshCount += 1; } }) },
    sonner: { toast: { error() {}, info: (message) => toastMessages.push(message), success: (message) => toastMessages.push(message), warning() {} } },
  });
  const props = {
    courseId: 'course-1', enrollments: [],
    onInvite: async (input) => {
      calls.push(input);
      return { status: 'success', data: { inviteUrl: 'http://localhost:3002/invite/one-time-token', alreadyAssigned: false, emailDelivery: 'console' } };
    },
    onBulkInvite: async () => ({ status: 'success', data: { requested: 0, invalidCount: 0, sent: 0, failed: 0, emailDelivery: 'console', manualInvites: [] } }),
    onCancel: async () => ({ status: 'success' }), onSetDueDate: async () => ({ status: 'success' }),
  };
  let tree = h.render('CourseRosterManager', props);
  const form = find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Пригласить ученика');
  find(form, (node) => node.type === 'Input' && node.props.type === 'email').props.onChange({ target: { value: ' QA-Flow@Example.Invalid ' } });
  tree = h.render('CourseRosterManager', props);
  submit(find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Пригласить ученика'));
  await h.flush();

  assert.deepEqual(plain(calls), [{ courseId: 'course-1', accessMode: 'ALL_AT_ONCE', dueAt: null, email: 'qa-flow@example.invalid' }]);
  assert.equal(refreshCount, 1, 'the invitation roster refreshes after create');
  const refreshedTree = h.render('CourseRosterManager', props);
  assert.equal(find(refreshedTree, (node) => node.props['aria-label'] === 'Ссылка приглашения').props.value, 'http://localhost:3002/invite/one-time-token');
  assert.match(text(refreshedTree), /Локальный режим: письмо не отправлено/);
  assert.deepEqual(toastMessages, ['Локальный режим: письмо не отправлено, ссылка выведена в консоль']);
});

test('cancel access requires confirmation and reports the exact learner/course pair', async () => {
  const calls = [];
  let confirm = false;
  const h = load('app/teacher/_components/CourseRosterManager.tsx', {}, { window: { confirm: () => confirm } });
  const props = { courseId: 'course-1', enrollments: [{ id: 'enrollment-1', user: { id: 'learner-1', name: 'Learner', email: 'learner@example.test' }, status: 'Active', accessMode: 'ALL_AT_ONCE' }],
    onInvite: async () => ({ status: 'success', data: { inviteUrl: null, alreadyAssigned: false } }),
    onBulkInvite: async () => ({ status: 'success', data: { requested: 0, invalidCount: 0, sent: 0, failed: 0, emailDelivery: 'sent', manualInvites: [] } }),
    onCancel: async (value) => { calls.push(value); return { status: 'success' }; }, onSetDueDate: async () => ({ status: 'success' }),
  };
  let tree = h.render('CourseRosterManager', props);
  find(tree, (node) => node.type === 'Button' && node.props['aria-label'] === 'Снять доступ: learner@example.test').props.onClick();
  await h.flush();
  assert.deepEqual(calls, []);
  confirm = true;
  tree = h.render('CourseRosterManager', props);
  find(tree, (node) => node.type === 'Button' && node.props['aria-label'] === 'Снять доступ: learner@example.test').props.onClick();
  await h.flush();
  assert.deepEqual(plain(calls), [{ courseId: 'course-1', userId: 'learner-1' }]);
});

test('manual review validates bounds and keeps score/comment after a recoverable save error', async () => {
  const calls = [];
  const h = load('app/teacher/_components/SubmissionReviewForm.tsx', {
    '@/hooks/try-catch': { tryCatch: async (promise) => { try { return { data: await promise, error: null }; } catch (error) { return { data: null, error }; } } },
  });
  const props = { target: { quizAttemptId: 'attempt-1' }, initialScore: null, initialComment: null,
    onSubmit: async (value) => { calls.push(value); return { status: 'error', message: 'Temporary save failure' }; } };
  let tree = h.render('SubmissionReviewForm', props);
  const fields = nodes(find(tree, (node) => node.type === 'form')).filter((node) => node.type === 'Input' || node.type === 'Textarea');
  fields[0].props.onChange({ target: { value: '101' } });
  fields[1].props.onChange({ target: { value: 'Review text' } });
  tree = h.render('SubmissionReviewForm', props);
  submit(find(tree, (node) => node.type === 'form'));
  await h.flush();
  assert.equal(calls.length, 0);
  tree = h.render('SubmissionReviewForm', props);
  const retryFields = nodes(find(tree, (node) => node.type === 'form')).filter((node) => node.type === 'Input' || node.type === 'Textarea');
  retryFields[0].props.onChange({ target: { value: '90' } });
  tree = h.render('SubmissionReviewForm', props);
  submit(find(tree, (node) => node.type === 'form'));
  await h.flush();
  assert.deepEqual(plain(calls), [{ quizAttemptId: 'attempt-1', score: 90, comment: 'Review text' }]);
  tree = h.render('SubmissionReviewForm', props);
  assert.equal(find(tree, (node) => node.props?.role === 'alert').props.children, 'Temporary save failure');
  const finalFields = nodes(find(tree, (node) => node.type === 'form')).filter((node) => node.type === 'Input' || node.type === 'Textarea');
  assert.equal(finalFields[0].props.value, '90');
  assert.equal(finalFields[1].props.value, 'Review text');
});

test('learner quiz history renders each submitted answer and teacher feedback', () => {
  const h = load('app/dashboard/courses/[slug]/(lesson)/[lessonId]/_components/LearnerQuizAttemptHistory.tsx');
  const tree = h.render('LearnerQuizAttemptHistory', { attempts: [{ id: 'attempt-1', selectedAnswers: [
    { questionId: 'q1', questionText: 'Which answer?', selectedAnswerIds: ['a1'], selectedAnswerTexts: ['My answer'] },
  ], score: 0, total: 1, passed: false, submittedAt: '2026-10-14T12:00:00Z', feedback: { score: 70, comment: 'Review this condition.' } }] });
  const renderedText = text(tree);
  assert.match(renderedText, /История попыток/);
  assert.match(renderedText, /Мои ответы/);
  assert.match(renderedText, /My answer/);
  assert.match(renderedText, /70\s*\/\s*100/);
  assert.match(renderedText, /Review this condition\./);
});

test('notification center marks only the selected notice read and refreshes the dashboard', async () => {
  const calls = [];
  let refreshes = 0;
  const h = load('app/dashboard/_components/NotificationCenter.tsx', {
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
  });
  const tree = h.render('NotificationCenter', { notifications: [{
    id: 'notice-1', type: 'COURSE_DUE_SOON', title: 'Deadline soon', body: 'Course One is due.', readAt: null,
    createdAt: '2026-10-14T10:00:00Z', courseId: 'course-1', course: { title: 'Course One', slug: 'course-one', organization: { slug: 'school-one' } },
  }], onMarkRead: async (id) => { calls.push(id); return { status: 'success' }; } });
  find(tree, (node) => node.type === 'Button' && node.props['aria-label'] === 'Отметить прочитанным: Deadline soon').props.onClick();
  await h.flush();
  assert.deepEqual(calls, ['notice-1']);
  assert.equal(refreshes, 1);
  assert.equal(find(tree, (node) => node.type === 'Link' && node.props.href === '/dashboard/schools/school-one/courses/course-one').props.children, 'Course One');
});
