/* eslint-disable @typescript-eslint/no-require-imports */
// Native Node tests exercise the real TSX handlers with controlled hooks/services.
// No test framework or new dependency is required: node --test tests/frontend-regressions.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const learner = "app/dashboard/courses/[slug]/(lesson)/[lessonId]";
const admin = "app/admin/courses/[courseId]/chapters/[chapterId]";
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(file, overrides = {}, globals = {}) {
  const state = [];
  const effects = [];
  const transitions = [];
  let cursor = 0;
  let pending = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useMemo: (factory) => factory(),
    useEffect: (effect) => effects.push(effect),
    useTransition: () => [pending, (callback) => { transitions.push(callback()); }],
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": { useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
    "@/hooks/try-catch": { tryCatch: async (promise) => {
      try { return { data: await promise, error: null }; }
      catch (error) { return { data: null, error }; }
    } },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/lib/organization/course-links": { dashboardCourseHref: (organizationSlug, slug, lessonId) => `/dashboard/schools/${encodeURIComponent(organizationSlug)}/courses/${encodeURIComponent(slug)}${lessonId ? `/${encodeURIComponent(lessonId)}` : ""}` },
    sonner: { toast: { error() {}, success() {} } },
    ...overrides,
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, {
    exports, console, Date, Set, Map, Object, crypto: { randomUUID: () => "event-1" },
    require: (name) => modules[name] ?? new Proxy({}, { get: (_, property) => String(property) }),
    ...globals,
  }, { filename: file });
  return {
    exports, effects, state,
    render: (name, props) => { cursor = 0; return exports[name](props); },
    flush: async () => { await Promise.all(transitions.splice(0)); },
    setPending: (value) => { pending = value; },
  };
}

function nodes(tree, expand = false) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, expand));
  if (expand && typeof tree.type === "function") return nodes(tree.type(tree.props), expand);
  return [tree, ...nodes(tree.props?.children, expand)];
}
const find = (tree, predicate, expand = false) => {
  const result = nodes(tree, expand).find(predicate);
  assert.ok(result, "Expected element must be rendered");
  return result;
};
const text = (tree) => typeof tree === "string" ? tree : Array.isArray(tree)
  ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : "";
const button = (tree, label) => find(tree, (node) => node.type === "Button" && text(node).includes(label));

test("recent dashboard courses link to their existing admin edit pages", () => {
  const h = load("app/admin/_components/analytics/RecentCourses.tsx", {
    "next/link": { default: (props) => ({ type: "a", props }) },
    "@/components/ui/button": { buttonVariants: () => "button" },
  });
  const courses = ["course-a", "course-b"].map((id) => ({
    id, title: `Course ${id}`, imageUrl: null, status: "DRAFT",
    level: "BEGINNER", duration: 30, createdAt: new Date(),
  }));
  const tree = h.render("RecentCourses", { courses });
  for (const course of courses) {
    const link = find(tree, (node) => node.type === "a" && text(node).includes(course.title), true);
    assert.equal(link.props.href, `/admin/courses/${course.id}/edit`);
  }
});

test("continue links resume at the saved lesson and cell safely", () => {
  const file = path.join(__dirname, "..", "app/dashboard/_lib/learning-links.ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, encodeURIComponent, require(name) {
    if (name === "@/lib/organization/course-links") return { dashboardCourseHref: (org, slug, lesson) => `/dashboard/schools/${encodeURIComponent(org)}/courses/${encodeURIComponent(slug)}${lesson ? `/${encodeURIComponent(lesson)}` : ""}` };
    throw new Error(`Unexpected import ${name}`);
  } });
  assert.equal(exports.getLearningLocationHref({ organizationSlug: "school A", slug: "math course", lessonId: "lesson/4", cellId: "cell 2" }),
    "/dashboard/schools/school%20A/courses/math%20course/lesson%2F4?cellId=cell%202");
  assert.equal(exports.getLearningLocationHref({ organizationSlug: "school", slug: "math", lessonId: null, cellId: null }),
    "/dashboard/schools/school/courses/math");
});

test("review form validates score and preserves feedback after a failed save", async () => {
  const calls = [];
  const h = load("app/teacher/_components/SubmissionReviewForm.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
    "@/components/ui/textarea": { Textarea: "Textarea" },
  });
  const props = { target: { codeSubmissionId: "submission-a" }, onSubmit: async (input) => {
    calls.push(input); return { status: "error", message: "Try again" };
  } };
  let tree = h.render("SubmissionReviewForm", props);
  const form = find(tree, (n) => n.type === "form");
  find(tree, (n) => n.type === "Input").props.onChange({ target: { value: "101" } });
  find(tree, (n) => n.type === "Textarea").props.onChange({ target: { value: "Helpful note" } });
  tree = h.render("SubmissionReviewForm", props);
  find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.match(text(find(h.render("SubmissionReviewForm", props), (n) => n.props.role === "alert")), /от 0 до 100/);

  find(h.render("SubmissionReviewForm", props), (n) => n.type === "Input").props.onChange({ target: { value: "87" } });
  tree = h.render("SubmissionReviewForm", props);
  find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  await h.flush();
  tree = h.render("SubmissionReviewForm", props);
  assert.equal(calls[0].score, 87);
  assert.equal(calls[0].comment, "Helpful note");
  assert.equal(find(tree, (n) => n.type === "Input").props.value, "87");
  assert.equal(find(tree, (n) => n.type === "Textarea").props.value, "Helpful note");
  assert.match(text(find(tree, (n) => n.props.role === "alert")), /Try again/);
  assert.equal(form.type, "form");
});

test("teacher bulk invitation form normalizes addresses and keeps input after API failure", async () => {
  const calls = [];
  const h = load("app/teacher/_components/CourseRosterManager.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
    "@/components/ui/textarea": { Textarea: "Textarea" },
    "@/components/ui/badge": { Badge: "Badge" },
  });
  const props = {
    courseId: "course-a", enrollments: [],
    onInvite: async () => ({ status: "error", message: "invite error" }),
    onBulkInvite: async (input) => { calls.push(input); return { status: "error", message: "bulk error" }; },
    onCancel: async () => ({ status: "success" }), onSetDueDate: async () => ({ status: "success" }),
  };
  let tree = h.render("CourseRosterManager", props);
  const field = find(tree, (n) => n.type === "Textarea");
  field.props.onChange({ target: { value: " A@Example.test,\nb@example.test a@example.test " } });
  tree = h.render("CourseRosterManager", props);
  const form = find(tree, (n) => n.type === "form" && n.props["aria-label"] === "Пригласить учеников списком");
  form.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.deepEqual(plain(calls[0]), {
    courseId: "course-a", accessMode: "ALL_AT_ONCE", dueAt: null,
    emails: ["a@example.test", "b@example.test"],
  });
  assert.equal(find(h.render("CourseRosterManager", props), (n) => n.type === "Textarea").props.value,
    " A@Example.test,\nb@example.test a@example.test ");
});

function heartbeat() {
  let now = 0;
  let tick;
  const events = {};
  const requests = [];
  const document = { visibilityState: "visible", addEventListener: (event, handler) => { events[event] = handler; }, removeEventListener() {} };
  const harness = load(`${learner}/_components/ActivityHeartbeat.tsx`, {}, {
    Date: { now: () => now }, document,
    window: { addEventListener: (event, handler) => { events[event] = handler; }, removeEventListener() {},
      setInterval: (handler) => { tick = handler; return 1; }, clearInterval() {} },
    fetch: async (_, request) => { requests.push(JSON.parse(request.body)); },
  });
  harness.render("ActivityHeartbeat", { cellId: "cell-a", kind: "SOLVING" });
  harness.effects[0]();
  return { requests, document, events, at: (value) => { now = value; }, tick: () => tick() };
}

test("continuous typing records the complete active interval", () => {
  const h = heartbeat();
  for (let time = 1_000; time < 20_000; time += 1_000) { h.at(time); h.events.keydown(); }
  h.at(20_000); h.tick();
  assert.equal(h.requests[0]?.seconds, 20);
  assert.equal(h.requests[0]?.cellId, "cell-a");
});

test("idle time stops counting and resuming never includes the idle gap", () => {
  const h = heartbeat();
  for (const time of [20_000, 40_000, 60_000, 80_000]) { h.at(time); h.tick(); }
  assert.deepEqual(h.requests.map((r) => r.seconds), [20, 20, 20]);
  h.at(95_000); h.events.keydown(); h.at(100_000); h.tick();
  assert.equal(h.requests.at(-1).seconds, 5);
});

test("background tabs do not record time, returning starts a new interval", () => {
  const h = heartbeat();
  h.at(10_000); h.document.visibilityState = "hidden"; h.events.visibilitychange();
  h.at(20_000); h.tick(); assert.equal(h.requests.length, 0);
  h.at(30_000); h.document.visibilityState = "visible"; h.events.visibilitychange();
  h.at(40_000); h.tick(); assert.equal(h.requests[0].seconds, 10);
});

test("email login submits with Enter through a native validated form", async () => {
  const sent = [];
  const h = load("app/(auth)/login/_components/LoginForm.tsx", {
    "@/lib/auth-client": { authClient: { emailOtp: { sendVerificationOtp: async (value) => { sent.push(value); } } } },
  });
  let tree = h.render("LoginForm", {});
  const input = find(tree, (n) => n.type === "Input");
  assert.equal(input.props.type, "email"); assert.equal(input.props.required, true);
  input.props.onChange({ target: { value: "learner@example.test" } });
  tree = h.render("LoginForm", {});
  assert.equal(button(tree, "Send OTP").props.type, "submit");
  let prevented = false;
  find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault: () => { prevented = true; } });
  await h.flush(); assert.equal(prevented, true); assert.equal(sent[0].email, "learner@example.test");
});

function chapterProps() {
  return { chapter: { id: "chapter-a", title: "Original", courseId: "course-a", lessons: [
    { id: "lesson-a", title: "First" }, { id: "lesson-b", title: "Second" },
  ] } };
}

test("failed chapter reorder rolls back the visible lesson order", async () => {
  const h = load(`${admin}/_components/ChapterEditor.tsx`, {
    "../../../edit/actions": { reorderLessons: async () => ({ status: "error", message: "Failed" }) },
  });
  const props = chapterProps();
  find(h.render("ChapterEditor", props), (n) => n.props["aria-label"] === "Ниже").props.onClick();
  assert.equal(h.state[0].lessons[0].id, "lesson-b");
  await h.flush(); assert.equal(h.state[0].lessons[0].id, "lesson-a");
});

test("chapter save updates its baseline so the Save button becomes disabled", async () => {
  const h = load(`${admin}/_components/ChapterEditor.tsx`, {
    "../../../edit/actions": { updateChapter: async () => ({ status: "success" }) },
  });
  const props = chapterProps();
  find(h.render("ChapterEditor", props), (n) => n.type === "Input").props.onChange({ target: { value: "  Renamed  " } });
  button(h.render("ChapterEditor", props), "Сохранить").props.onClick(); await h.flush();
  assert.equal(button(h.render("ChapterEditor", props), "Сохранить").props.disabled, true);
});

test("failed course chapter reorder restores the saved order", async () => {
  const h = load("app/admin/courses/[courseId]/edit/_components/EditCourseStructureForm.tsx", {
    "next/link": { default: "Link" },
    "@dnd-kit/react": { DragDropProvider: "DragDropProvider" },
    "@dnd-kit/react/sortable": { isSortable: () => true, useSortable: () => ({ ref: null, handleRef: null, isDragging: false }) },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/card": { Card: "Card" },
    "lucide-react": { BookOpenIcon: "BookOpenIcon", GripVerticalIcon: "GripVerticalIcon" },
    "../actions": { reorderChapters: async () => ({ status: "error", message: "Failed" }) },
  });
  const chapters = [
    { id: "chapter-a", title: "A", position: 1, lessons: [] },
    { id: "chapter-b", title: "B", position: 2, lessons: [] },
  ];
  const course = { id: "course-a", courseChapters: chapters };
  const tree = h.render("EditCourseStructureForm", { course });
  find(tree, (node) => node.type === "DragDropProvider").props.onDragEnd({
    canceled: false,
    operation: { source: { initialIndex: 0, index: 1 } },
  });
  assert.equal(h.state[0][0].id, "chapter-b");
  await h.flush();
  assert.equal(h.state[0][0].id, "chapter-a");
});

test("quiz cell title can be saved independently of quiz questions", async () => {
  const saved = [];
  const h = load(`${admin}/lessons/[lessonId]/_components/LessonCellEditor.tsx`, {
    "@/app/admin/courses/[courseId]/[chapterId]/[lessonId]/cell-actions": {
      updateLessonCell: async (value) => { saved.push(value); return { status: "success" }; },
    },
  });
  const cell = { id: "quiz-a", type: "QUIZ", title: "Old", quiz: null };
  const props = { courseId: "course-a", chapterId: "chapter-a", lesson: {
    id: "lesson-a", cells: [cell], chapter: { title: "Chapter", course: { title: "Course", courseChapters: [] } },
  }, selectedCell: cell };
  let tree = h.render("LessonCellEditor", props);
  tree = nodes(tree, true);
  find(tree, (n) => n.type === "Input").props.onChange({ target: { value: "New quiz title" } });
  tree = nodes(h.render("LessonCellEditor", props), true);
  button(tree, "Сохранить ячейку").props.onClick(); await h.flush();
  assert.equal(saved[0]?.cellId, "quiz-a"); assert.equal(saved[0]?.values.title, "New quiz title");
});

test("switching quiz editor cells uses independent question form instances", () => {
  const h = load(`${admin}/lessons/[lessonId]/_components/LessonCellEditor.tsx`);
  const cells = ["a", "b"].map((id) => ({ id, type: "QUIZ", quiz: null }));
  const props = { courseId: "course", chapterId: "chapter", selectedCell: cells[0], lesson: {
    cells, chapter: { course: { courseChapters: [] } },
  } };
  let tree = h.render("LessonCellEditor", props);
  const first = find(tree, (n) => n.type === "QuizEditor");
  find(tree, (n) => n.props["aria-label"] === "Ячейка 2: Quiz").props.onClick();
  const second = find(h.render("LessonCellEditor", props), (n) => n.type === "QuizEditor");
  assert.notEqual(first.key, second.key);
});

test("legacy Python lint settings render as Python with Ruff enabled", () => {
  const h = load(`${admin}/lessons/[lessonId]/_components/LessonCellEditor.tsx`);
  const cell = { id: "code-a", type: "CODE_TASK", title: "Legacy", lintConfig: { python: ["ruff"] } };
  const props = { courseId: "course", chapterId: "chapter", selectedCell: cell, lesson: {
    id: "lesson", cells: [cell], chapter: { course: { courseChapters: [] } },
  } };
  const tree = nodes(h.render("LessonCellEditor", props), true);
  assert.equal(find(tree, (n) => n.props["aria-label"] === "Язык решения").props.value, "python");
  assert.equal(find(tree, (n) => n.props["aria-label"] === "Ruff").props.checked, true);
  assert.equal(find(tree, (n) => n.props["aria-label"] === "Код дополнительной автопроверки").props.value, "");
  assert.match(text(tree), /def check\(input_text, expected_output, actual_output, source_code\):/);
  assert.match(text(tree), /true\/false или пустую\/непустую строку/);
});

test("code task editor serializes language, selected linters, and checker code", async () => {
  const saved = [];
  const h = load(`${admin}/lessons/[lessonId]/_components/LessonCellEditor.tsx`, {
    "@/app/admin/courses/[courseId]/[chapterId]/[lessonId]/cell-actions": {
      updateLessonCell: async (value) => { saved.push(value); return { status: "success" }; },
    },
  });
  const cell = { id: "code-a", type: "CODE_TASK", title: "Task", lintConfig: { language: "python", linters: ["ruff"] } };
  const props = { courseId: "course", chapterId: "chapter", selectedCell: cell, lesson: {
    id: "lesson", cells: [cell], chapter: { course: { courseChapters: [] } },
  } };
  let tree = nodes(h.render("LessonCellEditor", props), true);
  find(tree, (n) => n.props["aria-label"] === "Язык решения").props.onChange({ target: { value: "javascript" } });
  tree = nodes(h.render("LessonCellEditor", props), true);
  assert.equal(find(tree, (n) => n.props["aria-label"] === "ESLint").props.checked, true);
  assert.match(text(tree), /function check\(\{input, expectedOutput, actualOutput, sourceCode\}\)/);
  assert.match(text(tree), /true\/false или пустую\/непустую строку/);
  find(tree, (n) => n.props["aria-label"] === "Код дополнительной автопроверки").props.onChange({ target: { value: "return actual === expected;" } });
  tree = nodes(h.render("LessonCellEditor", props), true);
  button(tree, "Сохранить ячейку").props.onClick();
  await h.flush();
  assert.deepEqual(plain(saved[0]?.values.lintConfig), {
    language: "javascript", linters: ["eslint"], checkerCode: "return actual === expected;",
  });
});

test("course package import sends GitHub URL, target organization, and optional progress", async () => {
  const requests = [];
  class MockFormData {
    values = {};
    set(key, value) { this.values[key] = value; }
  }
  const h = load("app/teacher/_components/CoursePackageTools.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
  }, {
    FormData: MockFormData,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ course: { id: "imported", title: "Imported course", slug: "imported-course" }, warnings: [] }) };
    },
  });
  const props = { organizations: [{ id: "org-a", name: "School A" }, { id: "org-b", name: "School B" }] };
  let tree = nodes(h.render("CoursePackageImportForm", props), true);
  find(tree, (n) => n.type === "input" && n.props.type === "radio" && n.props.value === "github").props.onChange();
  tree = nodes(h.render("CoursePackageImportForm", props), true);
  find(tree, (n) => n.props["aria-label"] === "GitHub URL курса").props.onChange({ target: { value: "https://github.com/example/course" } });
  find(tree, (n) => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } });
  tree = nodes(h.render("CoursePackageImportForm", props), true);
  find(tree, (n) => n.props["aria-label"] === "Организация для импорта").props.onChange({ target: { value: "org-b" } });
  tree = nodes(h.render("CoursePackageImportForm", props), true);
  await find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(requests[0].url, "/api/teacher/course-packages/import");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(requests[0].options.body.values, {
    organizationId: "org-b", includeProgress: "true", githubUrl: "https://github.com/example/course",
  });
  assert.match(text(nodes(h.render("CoursePackageImportForm", props), true)), /Курс «Imported course» импортирован/);
});

test("course package import displays server errors", async () => {
  const h = load("app/teacher/_components/CoursePackageTools.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
  }, {
    FormData: class { set() {} },
    fetch: async () => ({ ok: false, json: async () => ({ error: "Нет прав импортировать курс" }) }),
  });
  const props = { organizations: [{ id: "org-a", name: "School A" }] };
  let tree = nodes(h.render("CoursePackageImportForm", props), true);
  find(tree, (n) => n.type === "Input" && n.props.type === "file").props.onChange({ target: { files: [{ name: "course.s84course" }] } });
  tree = nodes(h.render("CoursePackageImportForm", props), true);
  await find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  tree = nodes(h.render("CoursePackageImportForm", props), true);
  assert.match(text(find(tree, (n) => n.props.role === "alert")), /Нет прав импортировать курс/);
});

test("course package export requests the progress option and downloads the response", async () => {
  const requests = [];
  const downloaded = [];
  const anchor = { click() { downloaded.push({ href: this.href, download: this.download }); }, remove() {} };
  const h = load("app/teacher/_components/CoursePackageTools.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
  }, {
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, headers: { get: () => 'attachment; filename="course.s84course"' }, blob: async () => ({ type: "application/zip" }) };
    },
    URL: { createObjectURL: () => "blob:package", revokeObjectURL() {} },
    document: { createElement: () => anchor, body: { appendChild() {} } },
  });
  let tree = nodes(h.render("CoursePackageExportControls", { courseId: "course-a" }), true);
  find(tree, (n) => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } });
  tree = nodes(h.render("CoursePackageExportControls", { courseId: "course-a" }), true);
  await button(tree, "Скачать пакет курса").props.onClick();
  assert.deepEqual(plain(requests), ["/api/teacher/courses/course-a/package?includeProgress=true"]);
  assert.deepEqual(plain(downloaded), [{ href: "blob:package", download: "course.s84course" }]);
});

test("course package export displays server errors", async () => {
  const h = load("app/teacher/_components/CoursePackageTools.tsx", {
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
  }, {
    fetch: async () => ({ ok: false, json: async () => ({ error: "Не удалось экспортировать курс" }) }),
  });
  const props = { courseId: "course-a" };
  const tree = nodes(h.render("CoursePackageExportControls", props), true);
  await button(tree, "Скачать пакет курса").props.onClick();
  assert.match(text(find(nodes(h.render("CoursePackageExportControls", props), true), (n) => n.props.role === "alert")), /Не удалось экспортировать курс/);
});

test("teacher pages expose package import and course export controls", () => {
  const home = fs.readFileSync(path.join(__dirname, "../app/teacher/page.tsx"), "utf8");
  const edit = fs.readFileSync(path.join(__dirname, "../app/teacher/courses/[courseId]/edit/page.tsx"), "utf8");
  assert.match(home, /getMyOrganizations\(\)/);
  assert.match(home, /<CoursePackageImportForm/);
  assert.match(edit, /<CoursePackageExportControls/);
});

test("learner cell navigation remounts state belonging to a different cell", async () => {
  const cells = ["a", "b"].map((id) => ({ id, status: "AVAILABLE", type: "CODE_TASK" }));
  const h = load(`${learner}/page.tsx`, {
    "@/app/data/user/get-course-for-learning": { getCourseForLearning: async () => ({ organization: { slug: "school" }, courseChapters: [
      { title: "Chapter", lessons: [{ id: "lesson-a", isUnlocked: true, cells }] },
    ] }) },
  });
  const render = async (cellId) => h.render("default", {
    params: Promise.resolve({ slug: "python", lessonId: "lesson-a" }), searchParams: Promise.resolve({ cellId }),
  });
  const first = find(await render("a"), (n) => n.type === "LessonCellContent");
  const second = find(await render("b"), (n) => n.type === "LessonCellContent");
  assert.notEqual(first.key, second.key);
});

test("empty chapters and lessons retain their own editor state identity", async () => {
  const h = load(`${admin}/page.tsx`, {
    "@/app/data/admin/admin-get-chapter": { adminGetChapter: async (id) => ({ id, courseId: "course", course: {}, lessons: [] }) },
  });
  const render = (chapterId) => h.render("default", { params: Promise.resolve({ courseId: "course", chapterId }) });
  const first = find(await render("a"), (n) => n.type === "ChapterEditor");
  const second = find(await render("b"), (n) => n.type === "ChapterEditor");
  assert.notEqual(first.key, second.key);
  const lesson = load(`${admin}/lessons/[lessonId]/page.tsx`, {
    "@/app/data/admin/admin-get-lesson": { adminGetLesson: async ({ id }) => ({ id, chapterId: "chapter", chapter: { courseId: "course" }, cells: [] }) },
  });
  const renderLesson = (lessonId) => lesson.render("default", { params: Promise.resolve({ courseId: "course", chapterId: "chapter", lessonId }), searchParams: Promise.resolve({}) });
  assert.notEqual(find(await renderLesson("a"), (n) => n.type === "LessonCellEditor").key,
    find(await renderLesson("b"), (n) => n.type === "LessonCellEditor").key);
});

const quiz = { questions: [{ id: "q1", type: "SINGLE", text: "What is 2 + 2?", answers: [
  { id: "a1", text: "Four" }, { id: "a2", text: "Five" },
] }] };

test("correct quiz completion sends the selected answers for server verification", async () => {
  const passed = [];
  const h = load(`${learner}/_components/QuizPlayer.tsx`, {
    "../quiz-actions": { gradeQuizAnswerAction: async () => ({ isCorrect: true, correctAnswerIds: ["a1"], explanations: {} }) },
  });
  const props = { quiz, onSubmitted: (answers) => passed.push(answers) };
  find(h.render("QuizPlayer", props), (n) => n.props.question).props.onSingleChange("a1");
  button(h.render("QuizPlayer", props), "Submit answer").props.onClick(); await h.flush();
  button(h.render("QuizPlayer", props), "See result").props.onClick();
  assert.deepEqual(plain(passed), [{ q1: ["a1"] }]);
});

test("incorrect quiz completion still records the selected answers", async () => {
  const submitted = [];
  const h = load(`${learner}/_components/QuizPlayer.tsx`, {
    "../quiz-actions": { gradeQuizAnswerAction: async () => ({ isCorrect: false, correctAnswerIds: ["a1"], explanations: {} }) },
  });
  const props = { quiz, onSubmitted: (answers) => submitted.push(answers) };
  find(h.render("QuizPlayer", props), (n) => n.props.question).props.onSingleChange("a2");
  button(h.render("QuizPlayer", props), "Submit answer").props.onClick(); await h.flush();
  button(h.render("QuizPlayer", props), "See result").props.onClick();
  assert.deepEqual(plain(submitted), [{ q1: ["a2"] }]);
});

test("wrong quiz attempt response is shown as a saved attempt, not a server error", async () => {
  const info = [];
  const inputs = [];
  const h = load(`${learner}/_components/QuizCellPlayer.tsx`, {
    "../cell-progress-actions": { passLessonCellAction: async (input) => {
      inputs.push(input); return { status: "error", message: "Answer every question", data: { score: 0, total: 1 } };
    } },
    sonner: { toast: { error: () => assert.fail("expected incorrect answers are not a server error"), success() {}, info: (message) => info.push(message) } },
  });
  const tree = h.render("QuizCellPlayer", { quiz, cellId: "quiz-a", passed: false });
  tree.props.onSubmitted({ q1: ["a2"] }); await h.flush();
  assert.deepEqual(plain(inputs), [{ cellId: "quiz-a", quizAnswers: { q1: ["a2"] } }]);
  assert.match(info[0], /Попытка сохранена: 0\/1/);
});

test("quiz bridge sends quizAnswers to the progression action", async () => {
  const inputs = [];
  const h = load(`${learner}/_components/QuizCellPlayer.tsx`, {
    "../cell-progress-actions": { passLessonCellAction: async (value) => { inputs.push(value); return { status: "success" }; } },
  });
  const tree = h.render("QuizCellPlayer", { quiz, cellId: "quiz-a", passed: false });
  tree.props.onSubmitted({ q1: ["a1"] }); await h.flush();
  assert.deepEqual(plain(inputs), [{ cellId: "quiz-a", quizAnswers: { q1: ["a1"] } }]);
});

test("quiz answer labels target controls and pending requests freeze choices", () => {
  for (const type of ["SINGLE", "MULTIPLE"]) {
    const h = load(`${learner}/_components/QuizPlayer.tsx`);
    h.setPending(true);
    const tree = h.render("QuizPlayer", { quiz: { questions: [{ ...quiz.questions[0], type }] } });
    const expanded = nodes(tree, true);
    for (const answer of quiz.questions[0].answers) {
      const control = find(expanded, (n) => n.props.id === `quiz-answer-${answer.id}`);
      assert.equal(control.props.disabled, true);
      const label = find(expanded, (n) => n.type === "label" && n.props.htmlFor === control.props.id);
      assert.equal(text(label), answer.text);
    }
  }
});

test("code submission network rejection preserves code and renders a recoverable error", async () => {
  const h = load(`${learner}/_components/CodeTaskWorkspace.tsx`, {
    "../code-submission-actions": { submitCodeTaskAction: async () => { throw new Error("Network unavailable"); } },
  });
  const props = { cell: { id: "code-a", starterCode: "print(1)", latestSubmission: null } };
  button(h.render("CodeTaskWorkspace", props), "Отправить решение").props.onClick(); await h.flush();
  const tree = h.render("CodeTaskWorkspace", props);
  assert.equal(find(tree, (n) => n.type === "Textarea").props.value, "print(1)");
  assert.equal(find(tree, (n) => n.type === "Textarea").props.maxLength, 30_000);
  assert.match(text(find(tree, (n) => n.props.role === "alert")), /Попробуйте снова/);
});

test("text completion copy describes saved progress rather than an unrelated lock", () => {
  const h = load(`${learner}/_components/PassCellButton.tsx`);
  const tree = h.render("PassCellButton", { cellId: "text-a", passed: false });
  assert.match(text(tree), /сохранить прогресс урока/);
  assert.doesNotMatch(text(tree), /открыть следующую/);
});

test("shared brand uses SchoolSphere by default and accepts a school logo/name override", () => {
  const h = load("components/brand.tsx", { "next/image": { default: "Image" } });
  const defaultTree = h.render("Brand", {});
  assert.equal(defaultTree.type, "span");
  assert.match(text(defaultTree), /SchoolSphere/);
  const schoolTree = h.render("Brand", { brand: { name: "Northside Academy", logoUrl: "/school.svg" } });
  assert.match(text(schoolTree), /Northside Academy/);
  const image = find(schoolTree, (node) => node.type === "Image");
  assert.equal(image.props.src, "/school.svg");
  assert.equal(image.props.alt, "");
  const coloredMark = find(h.render("Brand", { brand: { name: "Northside Academy", primaryColor: "#124a73" } }), (node) => node.type === "svg");
  assert.equal(coloredMark.props.style.color, "#124a73");
});
