INSERT INTO "user" (
  id,
  name,
  email,
  "emailVerified",
  "createdAt",
  "updatedAt",
  role,
  banned,
  "showCertificatesPublicly"
)
VALUES (
  'school84-local-admin',
  'School 84 Admin',
  'admin@school84.local',
  true,
  now(),
  now(),
  'admin',
  false,
  true
)
ON CONFLICT (email) DO UPDATE
SET role = 'admin', "emailVerified" = true;

INSERT INTO "user" (
  id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned,
  "showCertificatesPublicly"
)
VALUES (
  'school84-demo-student', 'Демо Ученик', 'student@school84.local', true,
  now(), now(), 'user', false, true
)
ON CONFLICT (email) DO UPDATE
SET name = 'Демо Ученик', role = 'user', "emailVerified" = true;

INSERT INTO organization (id, name, slug, "createdAt", "updatedAt")
VALUES (
  'school84-demo-school', 'Школа School 84', 'school84-demo-school', now(), now()
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, "updatedAt" = now();

INSERT INTO organization_membership ("organizationId", "userId", role, "createdAt")
SELECT organization.id, "user".id, 'OWNER', now()
FROM organization CROSS JOIN "user"
WHERE organization.slug = 'school84-demo-school' AND "user".email = 'admin@school84.local'
ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'OWNER';

INSERT INTO organization_membership ("organizationId", "userId", role, "createdAt")
SELECT organization.id, "user".id, 'STUDENT', now()
FROM organization CROSS JOIN "user"
WHERE organization.slug = 'school84-demo-school' AND "user".email = 'student@school84.local'
ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'STUDENT';

INSERT INTO "Course" (
  id, title, description, "smallDesc", "priceCents", duration, level, slug,
  status, "organizationId", "createdAt", "updatedAt", "userId"
)
VALUES (
  'school84-demo-python', 'Python с нуля: от первых строк к проектам',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Пошаговый курс по материалам учебных блокнотов: 9 тем, 16 уроков, короткие конспекты, задачи с автопроверкой и квизы. Изучите основы Python и постепенно соберите навыки для небольших проектов."}]}]}',
  '16 уроков: конспекты, практика с автопроверкой и квизы', 0, 540, 'BEGINNER',
  'school84-demo-python', 'PUBLISHED',
  (SELECT id FROM organization WHERE slug = 'school84-demo-school'), now(), now(),
  (SELECT id FROM "user" WHERE email = 'admin@school84.local')
)
ON CONFLICT ("organizationId", slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  "smallDesc" = EXCLUDED."smallDesc",
  status = EXCLUDED.status,
  "updatedAt" = now();

INSERT INTO "CourseChapter" (id, title, position, "createdAt", "updatedAt", "courseId")
VALUES ('school84-demo-python-chapter', 'Основы Python', 1, now(), now(), 'school84-demo-python')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, position = EXCLUDED.position;

INSERT INTO "Lesson" (id, title, description, position, "createdAt", "updatedAt", "chapterId")
VALUES ('school84-demo-python-lesson', 'Текст, ввод и вывод', 'Научитесь выводить текст и получать ответы от пользователя.', 1, now(), now(), 'school84-demo-python-chapter')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO lesson_cell (
  id, "lessonId", position, type, title, "textContent", "createdAt", "updatedAt"
)
VALUES (
  'school84-demo-python-text', 'school84-demo-python-lesson', 1, 'TEXT', 'Конспект',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Вывод текста и ввод данных"}]},{"type":"paragraph","content":[{"type":"text","text":"Функция "},{"type":"text","marks":[{"type":"code"}],"text":"print()"},{"type":"text","text":" показывает результат программы. Функция "},{"type":"text","marks":[{"type":"code"}],"text":"input()"},{"type":"text","text":" читает строку, которую передал пользователь."}]},{"type":"codeBlock","content":[{"type":"text","text":"name = input()\nprint(''Привет, '' + name + ''!'')"}]},{"type":"paragraph","content":[{"type":"text","text":"Попробуйте запустить следующую ячейку и посмотрите, как программа использует введённое имя."}]}]}',
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET "textContent" = EXCLUDED."textContent";

INSERT INTO lesson_cell (
  id, "lessonId", position, type, title, "taskPrompt", "starterCode", "testCases", "lintConfig", "createdAt", "updatedAt"
)
VALUES (
  'school84-demo-python-task-1', 'school84-demo-python-lesson', 2, 'CODE_TASK', 'Скажи привет',
  'Прочитайте имя из входных данных и выведите строку «Привет, имя!». Например, для входа «Аня» программа должна вывести «Привет, Аня!».',
  'name = input()\n# Напишите решение ниже\n',
  '[{"input":"Аня\n","output":"Привет, Аня!\n"},{"input":"Sam\n","output":"Привет, Sam!\n"}]'::jsonb,
  '{"python":["ruff"]}'::jsonb,
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  "taskPrompt" = EXCLUDED."taskPrompt",
  "starterCode" = EXCLUDED."starterCode",
  "testCases" = EXCLUDED."testCases";

INSERT INTO lesson_cell (
  id, "lessonId", position, type, title, "taskPrompt", "starterCode", "testCases", "lintConfig", "createdAt", "updatedAt"
)
VALUES (
  'school84-demo-python-task-2', 'school84-demo-python-lesson', 3, 'CODE_TASK', 'Сложи два числа',
  'Прочитайте два целых числа, записанных каждое с новой строки, и выведите их сумму.',
  'first_number = int(input())\nsecond_number = int(input())\n# Выведите сумму чисел\n',
  '[{"input":"2\n3\n","output":"5\n"},{"input":"-4\n10\n","output":"6\n"}]'::jsonb,
  '{"python":["ruff"]}'::jsonb,
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  "taskPrompt" = EXCLUDED."taskPrompt",
  "starterCode" = EXCLUDED."starterCode",
  "testCases" = EXCLUDED."testCases";

INSERT INTO "Enrollment" (
  id, amount, status, "accessMode", "createdAt", "updatedAt", "courseId", "userId"
)
VALUES (
  'school84-demo-enrollment', 0, 'Active', 'SEQUENTIAL', now(), now(),
  'school84-demo-python', 'school84-demo-student'
)
ON CONFLICT ("userId", "courseId") DO UPDATE SET
  status = 'Active', "accessMode" = 'ALL_AT_ONCE', "updatedAt" = now();

INSERT INTO lesson_cell_progress (id, "userId", "lessonCellId", status, attempts, "passedAt", "createdAt", "updatedAt")
VALUES (
  'school84-demo-progress-text', 'school84-demo-student', 'school84-demo-python-text',
  'PASSED', 1, now() - interval '2 days', now(), now()
)
ON CONFLICT ("userId", "lessonCellId") DO UPDATE SET status = 'PASSED', "passedAt" = EXCLUDED."passedAt";

INSERT INTO lesson_cell_progress (id, "userId", "lessonCellId", status, attempts, "passedAt", "createdAt", "updatedAt")
VALUES (
  'school84-demo-progress-task-1', 'school84-demo-student', 'school84-demo-python-task-1',
  'PASSED', 1, now() - interval '1 day', now(), now()
)
ON CONFLICT ("userId", "lessonCellId") DO UPDATE SET status = 'PASSED', "passedAt" = EXCLUDED."passedAt";

INSERT INTO lesson_cell_progress (id, "userId", "lessonCellId", status, attempts, "createdAt", "updatedAt")
VALUES (
  'school84-demo-progress-task-2', 'school84-demo-student', 'school84-demo-python-task-2',
  'AVAILABLE', 0, now(), now()
)
ON CONFLICT ("userId", "lessonCellId") DO UPDATE SET status = 'AVAILABLE';

INSERT INTO code_submission (
  id, "userId", "lessonCellId", "sourceCode", status, "passedTests", "totalTests",
  "actualOutput", "durationMs", "createdAt"
)
VALUES (
  'school84-demo-submission-1', 'school84-demo-student', 'school84-demo-python-task-1',
  'name = input()\nprint("Привет, " + name + "!")', 'ACCEPTED', 2, 2,
  'Привет, Аня!', 120, now() - interval '1 day'
)
ON CONFLICT (id) DO UPDATE SET status = 'ACCEPTED', "passedTests" = 2, "totalTests" = 2;

INSERT INTO student_daily_activity (
  id, "userId", day, "readingSeconds", "solvingSeconds", "codeSubmissions", "acceptedTasks", "updatedAt"
)
SELECT
  md5('school84-demo-student-' || (CURRENT_DATE - day_offset)::text),
  'school84-demo-student',
  CURRENT_DATE - day_offset,
  CASE day_offset WHEN 0 THEN 360 ELSE 480 END,
  CASE day_offset WHEN 1 THEN 420 ELSE 0 END,
  CASE day_offset WHEN 1 THEN 1 ELSE 0 END,
  CASE day_offset WHEN 1 THEN 1 ELSE 0 END,
  now()
FROM generate_series(0, 2) AS day_offset
ON CONFLICT ("userId", day) DO UPDATE SET
  "readingSeconds" = EXCLUDED."readingSeconds",
  "solvingSeconds" = EXCLUDED."solvingSeconds",
  "codeSubmissions" = EXCLUDED."codeSubmissions",
  "acceptedTasks" = EXCLUDED."acceptedTasks",
  "updatedAt" = now();
