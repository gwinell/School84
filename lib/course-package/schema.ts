import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const mediaPathSchema = z.string().regex(/^assets\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,10}$/);

const answerSchema = z.object({
  text: z.string().min(1).max(500),
  isCorrect: z.boolean(),
  explanation: z.string().max(1000).nullable(),
  position: z.number().int().positive(),
}).strict();

const questionSchema = z.object({
  text: z.string().min(3).max(1000),
  type: z.enum(["SINGLE", "MULTIPLE"]),
  position: z.number().int().positive(),
  answers: z.array(answerSchema).min(2).max(50),
}).strict();

const quizSchema = z.object({ questions: z.array(questionSchema).max(100) }).strict();

const exampleSchema = z.object({ input: z.string().max(5000), output: z.string().max(5000) }).strict();
const lintConfigSchema = jsonValueSchema.nullable().superRefine((value, ctx) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const config = value as Record<string, unknown>;
  if (config.language !== undefined && config.language !== "python" && config.language !== "javascript") {
    ctx.addIssue({ code: "custom", path: ["language"], message: "Unsupported code task language" });
  }
  if (config.checkerCode !== undefined && (typeof config.checkerCode !== "string" || config.checkerCode.length > 30_000)) {
    ctx.addIssue({ code: "custom", path: ["checkerCode"], message: "checkerCode must be a string of at most 30000 characters" });
  }
});

const cellSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"), position: z.number().int().positive(), title: z.string().max(200).nullable(),
    textContent: z.string().max(100_000).nullable(),
  }).strict(),
  z.object({
    type: z.literal("CODE_TASK"), position: z.number().int().positive(), title: z.string().max(200).nullable(),
    taskPrompt: z.string().max(30_000).nullable(), starterCode: z.string().max(30_000).nullable(),
    examples: z.array(exampleSchema).max(20), testCases: z.array(exampleSchema).max(12),
    lintConfig: lintConfigSchema,
  }).strict(),
  z.object({
    type: z.literal("QUIZ"), position: z.number().int().positive(), title: z.string().max(200).nullable(),
    quiz: quizSchema.nullable(),
  }).strict(),
]);

const lessonSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(100_000).nullable(),
  video: mediaPathSchema.nullable(),
  position: z.number().int().positive(),
  legacyQuiz: quizSchema.nullable(),
  cells: z.array(cellSchema).max(500),
}).strict();

const chapterSchema = z.object({
  title: z.string().min(1).max(200),
  position: z.number().int().positive(),
  lessons: z.array(lessonSchema).max(1000),
}).strict();

export const coursePackageManifestSchema = z.object({
  format: z.literal("school84.course"),
  formatVersion: z.literal(1),
  course: z.object({
    title: z.string().min(5).max(32),
    description: z.string().max(2000).nullable(),
    smallDesc: z.string().min(1).max(100),
    priceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    duration: z.number().int().positive(),
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    slug: z.string().min(1).max(50),
    categories: z.array(z.string().min(2).max(50)).max(20),
    cover: mediaPathSchema.nullable(),
  }).strict(),
  chapters: z.array(chapterSchema).max(100),
  assets: z.array(z.object({
    path: mediaPathSchema,
    contentType: z.string().min(1).max(100),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).max(500),
  settings: z.object({
    grading: z.object({
      standardInputOutput: z.literal(true),
      authorChecks: z.boolean(),
    }).strict(),
  }).strict(),
}).strict().superRefine((manifest, ctx) => {
  const paths = new Set<string>();
  let assetBytes = 0;
  for (const asset of manifest.assets) {
    if (paths.has(asset.path)) ctx.addIssue({ code: "custom", path: ["assets"], message: "Duplicate asset path" });
    paths.add(asset.path);
    assetBytes += asset.size;
  }
  if (assetBytes > 125 * 1024 * 1024) ctx.addIssue({ code: "custom", path: ["assets"], message: "Course package assets exceed 125 MiB" });
  const lessons = manifest.chapters.flatMap((chapter) => chapter.lessons);
  if (lessons.length > 1000) ctx.addIssue({ code: "custom", path: ["chapters"], message: "Course package contains too many lessons" });
  if (lessons.reduce((sum, lesson) => sum + lesson.cells.length, 0) > 5000) ctx.addIssue({ code: "custom", path: ["chapters"], message: "Course package contains too many lesson cells" });
  const questionCount = lessons.reduce((sum, lesson) => sum + (lesson.legacyQuiz?.questions.length ?? 0) + lesson.cells.reduce((cellSum, cell) => cellSum + (cell.type === "QUIZ" ? cell.quiz?.questions.length ?? 0 : 0), 0), 0);
  if (questionCount > 10000) ctx.addIssue({ code: "custom", path: ["chapters"], message: "Course package contains too many quiz questions" });
  const referenced = new Set<string>();
  const hasCheckerCode = manifest.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.cells.some((cell) => {
    if (cell.type !== "CODE_TASK" || !cell.lintConfig || typeof cell.lintConfig !== "object" || Array.isArray(cell.lintConfig)) return false;
    const checkerCode = (cell.lintConfig as Record<string, unknown>).checkerCode;
    return typeof checkerCode === "string" && checkerCode.trim().length > 0;
  })));
  if (manifest.settings.grading.authorChecks !== hasCheckerCode) ctx.addIssue({ code: "custom", path: ["settings", "grading", "authorChecks"], message: "authorChecks does not match task checkerCode settings" });
  if (manifest.course.cover) referenced.add(manifest.course.cover);
  for (const chapter of manifest.chapters) for (const lesson of chapter.lessons) {
    if (lesson.video) referenced.add(lesson.video);
    for (const cell of lesson.cells) if (cell.type === "TEXT" && cell.textContent) {
      try {
        const richText: unknown = JSON.parse(cell.textContent);
        const visit = (value: unknown) => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) { value.forEach(visit); return; }
          const record = value as Record<string, unknown>;
          const attrs = record.attrs;
          if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
            const key = (attrs as Record<string, unknown>).key;
            if (typeof key === "string" && key.startsWith("assets/")) referenced.add(key);
          }
          Object.values(record).forEach(visit);
        };
        visit(richText);
      } catch { /* Text cells may contain plain text. */ }
    }
  }
  for (const path of referenced) if (!paths.has(path)) ctx.addIssue({ code: "custom", path: ["assets"], message: `Missing referenced asset: ${path}` });
  for (const asset of manifest.assets) if (!referenced.has(asset.path)) ctx.addIssue({ code: "custom", path: ["assets"], message: `Unreferenced asset: ${asset.path}` });
});

export const courseProgressSchema = z.object({
  format: z.literal("school84.course-progress"),
  formatVersion: z.literal(1),
  learners: z.array(z.object({
    email: z.string().email().max(254),
    lessonCompletion: z.array(z.object({ chapterPosition: z.number().int().positive(), lessonPosition: z.number().int().positive(), completed: z.boolean() }).strict()).max(1000),
    cells: z.array(z.object({ chapterPosition: z.number().int().positive(), lessonPosition: z.number().int().positive(), cellPosition: z.number().int().positive(), status: z.enum(["LOCKED", "AVAILABLE", "IN_PROGRESS", "PASSED"]), attempts: z.number().int().nonnegative() }).strict()).max(5000),
  }).strict()).max(5000),
}).strict().superRefine((progress, ctx) => {
  const emails = new Set<string>();
  let rows = 0;
  for (const learner of progress.learners) {
    const email = learner.email.trim().toLowerCase();
    if (emails.has(email)) ctx.addIssue({ code: "custom", path: ["learners"], message: "Duplicate learner email" });
    emails.add(email);
    rows += learner.lessonCompletion.length + learner.cells.length;
  }
  if (rows > 100_000) ctx.addIssue({ code: "custom", path: ["learners"], message: "Course progress contains too many records" });
});

export type CoursePackageManifest = z.infer<typeof coursePackageManifestSchema>;
export type CourseProgressFile = z.infer<typeof courseProgressSchema>;
