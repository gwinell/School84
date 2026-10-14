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
  const course = { id: 'course-1', slug: 'python', title: 'Python', smallDesc: '', imageUrl: null, level: 'BEGINNER', duration: 30, chaptersCount: 1, lessonsCount: 2, completedCount: 1, resumeLessonId: 'lesson-2', resumeCellId: 'cell-4' };
  const link = find(card.render('EnrolledCourseCard', { course }), (node) => node.type === 'Link' && node.props.children?.[0] === 'Continue');
  assert.equal(link.props.href, '/dashboard/courses/python/lesson-2?cellId=cell-4');
});

test('bulk course assignment normalizes and deduplicates emails before the action call', async () => {
  const calls = [];
  const h = load('app/teacher/_components/CourseRosterManager.tsx', {
    '@/components/ui/badge': { Badge: 'Badge' },
  });
  const props = { courseId: 'course-1', enrollments: [],
    onInvite: async () => ({ status: 'success', data: { inviteUrl: null, alreadyAssigned: false } }),
    onBulkAssign: async (value) => { calls.push(value); return { status: 'success', data: { created: 2, alreadyAssigned: 0, invalid: [] } }; },
    onCancel: async () => ({ status: 'success' }), onSetDueDate: async () => ({ status: 'success' }),
  };
  let tree = h.render('CourseRosterManager', props);
  const form = find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Массово назначить курс');
  const textarea = find(form, (node) => node.type === 'Textarea');
  textarea.props.onChange({ target: { value: ' A@Example.test, a@example.test\nB@Example.test; ' } });
  tree = h.render('CourseRosterManager', props);
  submit(find(tree, (node) => node.type === 'form' && node.props['aria-label'] === 'Массово назначить курс'));
  await h.flush();
  assert.deepEqual(plain(calls), [{ courseId: 'course-1', accessMode: 'ALL_AT_ONCE', dueAt: null, emails: ['a@example.test', 'b@example.test'] }]);
});

test('cancel access requires confirmation and reports the exact learner/course pair', async () => {
  const calls = [];
  let confirm = false;
  const h = load('app/teacher/_components/CourseRosterManager.tsx', {}, { window: { confirm: () => confirm } });
  const props = { courseId: 'course-1', enrollments: [{ id: 'enrollment-1', user: { id: 'learner-1', name: 'Learner', email: 'learner@example.test' }, status: 'Active', accessMode: 'ALL_AT_ONCE' }],
    onInvite: async () => ({ status: 'success', data: { inviteUrl: null, alreadyAssigned: false } }),
    onBulkAssign: async () => ({ status: 'success', data: { created: 0, alreadyAssigned: 0, invalid: [] } }),
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
    createdAt: '2026-10-14T10:00:00Z', courseId: 'course-1', course: { title: 'Course One', slug: 'course-one' },
  }], onMarkRead: async (id) => { calls.push(id); return { status: 'success' }; } });
  find(tree, (node) => node.type === 'Button' && node.props['aria-label'] === 'Отметить прочитанным: Deadline soon').props.onClick();
  await h.flush();
  assert.deepEqual(calls, ['notice-1']);
  assert.equal(refreshes, 1);
  assert.equal(find(tree, (node) => node.type === 'Link' && node.props.href === '/dashboard/courses/course-one').props.children, 'Course One');
});
