import "server-only";

import { GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

import { resolveCategories } from "@/app/data/course/resolve-categories";
import { env } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import { S3Client } from "@/lib/S3Client";
import { assetSignatureMatches, createCoursePackageZip, parseCoursePackageZip, sha256, COURSE_PACKAGE_MAX_FILE_BYTES, type CoursePackageFiles } from "./archive";
import { coursePackageManifestSchema, courseProgressSchema, type CoursePackageManifest, type CourseProgressFile } from "./schema";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(Object.entries(MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime]));
const COURSE_PACKAGE_MAX_ASSET_BYTES = 125 * 1024 * 1024;

type MediaContext = { assets: CoursePackageManifest["assets"]; bytes: Map<string, Uint8Array>; keyToPath: Map<string, string> };

function assetExtension(contentType: string, key: string): string {
  const mapped = MIME_EXTENSIONS[contentType.toLowerCase().split(";")[0].trim()];
  if (mapped) return mapped;
  const ext = key.split(".").pop()?.toLowerCase();
  return ext && MIME_BY_EXTENSION[ext] ? ext : "bin";
}

async function collectMedia(keys: Array<string | null | undefined>): Promise<MediaContext> {
  const unique = [...new Set(keys.filter((key): key is string => Boolean(key)))];
  const assets: MediaContext["assets"] = [];
  const bytes = new Map<string, Uint8Array>();
  const keyToPath = new Map<string, string>();
  let total = 0;
  for (const key of unique) {
    const result = await S3Client.send(new GetObjectCommand({ Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES, Key: key }));
    const contentType = (result.ContentType ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    if (!MIME_EXTENSIONS[contentType]) throw new Error(`Unsupported course media type for ${key}`);
    if ((result.ContentLength ?? 0) > COURSE_PACKAGE_MAX_FILE_BYTES) throw new Error(`Course media file is too large: ${key}`);
    if (!result.Body) throw new Error(`Course media is missing: ${key}`);
    const data = await result.Body.transformToByteArray();
    total += data.byteLength;
    if (data.byteLength > COURSE_PACKAGE_MAX_FILE_BYTES || total > COURSE_PACKAGE_MAX_ASSET_BYTES) throw new Error("Course media exceeds the 125 MiB total package asset limit");
    const digest = sha256(data);
    const path = `assets/${digest.slice(0, 24)}.${assetExtension(contentType, key)}`;
    const old = bytes.get(path);
    if (old && sha256(old) !== digest) throw new Error("Asset path collision");
    keyToPath.set(key, path);
    if (!old) {
      bytes.set(path, data);
      assets.push({ path, contentType, size: data.byteLength, sha256: digest });
    }
  }
  return { assets, bytes, keyToPath };
}

function convertTextMedia(text: string | null, keyToPath: Map<string, string>, toPackage: boolean): string | null {
  if (!text) return text;
  try {
    const root: unknown = JSON.parse(text);
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const record = value as Record<string, unknown>;
      const attrs = record.attrs;
      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        const imageAttrs = attrs as Record<string, unknown>;
        if (typeof imageAttrs.key === "string") {
          if (toPackage) {
            const path = keyToPath.get(imageAttrs.key);
            if (path) { imageAttrs.key = path; imageAttrs.src = path; }
          } else {
            const key = keyToPath.get(imageAttrs.key);
            if (key) { imageAttrs.key = key; imageAttrs.src = key; }
          }
        }
      }
      Object.values(record).forEach(visit);
    };
    visit(root);
    return JSON.stringify(root);
  } catch { return text; }
}

function quizData(quiz: { questions: Array<{ text: string; type: "SINGLE" | "MULTIPLE"; position: number; answers: Array<{ text: string; isCorrect: boolean; explanation: string | null; position: number }> }> } | null) {
  return quiz ? { questions: quiz.questions.map((q) => ({ text: q.text, type: q.type, position: q.position, answers: q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect, explanation: a.explanation, position: a.position })) })) } : null;
}

export async function exportCoursePackage(courseId: string, includeProgress = false): Promise<Uint8Array> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      title: true, description: true, smallDesc: true, duration: true, level: true, slug: true, fileKey: true, priceCents: true, organizationId: true,
      categories: { orderBy: { name: "asc" }, select: { name: true } },
      courseChapters: { orderBy: { position: "asc" }, select: { id: true, title: true, position: true, lessons: {
        orderBy: { position: "asc" }, select: { id: true, title: true, description: true, videoKey: true, position: true,
          quiz: { select: { questions: { orderBy: { position: "asc" }, select: { text: true, type: true, position: true, answers: { orderBy: { position: "asc" }, select: { text: true, isCorrect: true, explanation: true, position: true } } } } } },
          cells: { orderBy: { position: "asc" }, select: { type: true, position: true, title: true, textContent: true, taskPrompt: true, starterCode: true, examples: true, testCases: true, lintConfig: true,
            quiz: { select: { questions: { orderBy: { position: "asc" }, select: { text: true, type: true, position: true, answers: { orderBy: { position: "asc" }, select: { text: true, isCorrect: true, explanation: true, position: true } } } } } },
          } },
        } },
      } },
    },
  });
  if (!course) throw new Error("Course not found");
  const inlineKeys: string[] = [];
  const visitText = (text: string | null) => {
    if (!text) return;
    try {
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const record = value as Record<string, unknown>;
        const attrs = record.attrs;
        if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
          const key = (attrs as Record<string, unknown>).key;
          if (typeof key === "string") inlineKeys.push(key);
        }
        Object.values(record).forEach(visit);
      };
      visit(JSON.parse(text) as unknown);
    } catch { /* Preserve plain text. */ }
  };
  for (const chapter of course.courseChapters) for (const lesson of chapter.lessons) for (const cell of lesson.cells) if (cell.type === "TEXT") visitText(cell.textContent);
  const media = await collectMedia([course.fileKey, ...course.courseChapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => [lesson.videoKey, ...lesson.cells.flatMap((cell) => cell.type === "TEXT" ? [null] : [])])), ...inlineKeys]);
  const chapters = course.courseChapters.map((chapter) => ({
    title: chapter.title, position: chapter.position,
    lessons: chapter.lessons.map((lesson) => ({
      title: lesson.title, description: lesson.description, video: lesson.videoKey ? media.keyToPath.get(lesson.videoKey) ?? null : null, position: lesson.position,
      legacyQuiz: quizData(lesson.quiz),
      cells: lesson.cells.map((cell) => cell.type === "TEXT"
        ? { type: "TEXT" as const, position: cell.position, title: cell.title, textContent: convertTextMedia(cell.textContent, media.keyToPath, true) }
        : cell.type === "CODE_TASK"
          ? { type: "CODE_TASK" as const, position: cell.position, title: cell.title, taskPrompt: cell.taskPrompt, starterCode: cell.starterCode, examples: normalizeExamples(cell.examples), testCases: normalizeExamples(cell.testCases), lintConfig: cell.lintConfig }
          : { type: "QUIZ" as const, position: cell.position, title: cell.title, quiz: quizData(cell.quiz) }),
    })),
  }));
  const authorChecks = chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.cells.some((cell) => {
    if (cell.type !== "CODE_TASK" || !cell.lintConfig || typeof cell.lintConfig !== "object" || Array.isArray(cell.lintConfig)) return false;
    const checkerCode = (cell.lintConfig as Record<string, unknown>).checkerCode;
    return typeof checkerCode === "string" && checkerCode.trim().length > 0;
  })));
  const manifest = coursePackageManifestSchema.parse({
    format: "school84.course", formatVersion: 1,
    course: { title: course.title, description: course.description, smallDesc: course.smallDesc, priceCents: course.priceCents, duration: course.duration, level: course.level, slug: course.slug, categories: course.categories.map((category) => category.name), cover: course.fileKey ? media.keyToPath.get(course.fileKey) ?? null : null },
    chapters, assets: media.assets, settings: { grading: { standardInputOutput: true, authorChecks } },
  });
  const progress = includeProgress ? await exportProgress(courseId, course.organizationId, course.courseChapters) : undefined;
  return createCoursePackageZip({ manifest, assets: media.bytes, ...(progress ? { progress } : {}) });
}

function normalizeExamples(value: unknown): Array<{ input: string; output: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.input === "string" && typeof item.output === "string" ? [{ input: item.input, output: item.output }] : []);
}

async function exportProgress(courseId: string, organizationId: string, chapters: Array<{ id: string; position: number; lessons: Array<{ id: string; position: number; cells: Array<{ position: number }> }> }>): Promise<CourseProgressFile> {
  const lessonRows = chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ chapterPosition: chapter.position, lessonPosition: lesson.position, lessonId: lesson.id })));
  const lessonIds = lessonRows.map((lesson) => lesson.lessonId);
  const [lessonProgress, cellProgress] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { lessonId: { in: lessonIds }, user: { organizationMemberships: { some: { organizationId, role: "STUDENT" } }, enrollment: { some: { courseId, status: "Active" } } } }, select: { completed: true, lessonId: true, user: { select: { email: true } } } }),
    prisma.lessonCellProgress.findMany({ where: { lessonCell: { lessonId: { in: lessonIds } }, user: { organizationMemberships: { some: { organizationId, role: "STUDENT" } }, enrollment: { some: { courseId, status: "Active" } } } }, select: { status: true, attempts: true, lessonCellId: true, user: { select: { email: true } } } }),
  ]);
  const lessonById = new Map(lessonRows.map((row) => [row.lessonId, row]));
  const cellById = new Map<string, { chapterPosition: number; lessonPosition: number; cellPosition: number }>();
  const cellDetails = await prisma.lessonCell.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true, position: true, lessonId: true } });
  for (const cell of cellDetails) {
    const lesson = lessonById.get(cell.lessonId);
    if (lesson) cellById.set(cell.id, { chapterPosition: lesson.chapterPosition, lessonPosition: lesson.lessonPosition, cellPosition: cell.position });
  }
  const learners = new Map<string, CourseProgressFile["learners"][number]>();
  for (const row of lessonProgress) {
    const email = row.user.email.trim().toLowerCase(); const lesson = lessonById.get(row.lessonId);
    if (!lesson) continue;
    const learner = learners.get(email) ?? { email, lessonCompletion: [], cells: [] };
    learner.lessonCompletion.push({ chapterPosition: lesson.chapterPosition, lessonPosition: lesson.lessonPosition, completed: row.completed });
    learners.set(email, learner);
  }
  for (const row of cellProgress) {
    const email = row.user.email.trim().toLowerCase();
    const location = cellById.get(row.lessonCellId);
    if (!location) continue;
    const learner = learners.get(email) ?? { email, lessonCompletion: [], cells: [] };
    learner.cells.push({ ...location, status: row.status, attempts: row.attempts });
    learners.set(email, learner);
  }
  return courseProgressSchema.parse({ format: "school84.course-progress", formatVersion: 1, learners: [...learners.values()] });
}

function mapQuizCreate(quiz: { questions: Array<{ text: string; type: "SINGLE" | "MULTIPLE"; position: number; answers: Array<{ text: string; isCorrect: boolean; explanation: string | null; position: number }> }> } | null) {
  if (!quiz) return undefined;
  return { create: { questions: { create: quiz.questions.map((question) => ({
    text: question.text, type: question.type, position: question.position,
    answers: { create: question.answers.map((answer) => ({ text: answer.text, isCorrect: answer.isCorrect, explanation: answer.explanation ?? undefined, position: answer.position })) },
  })) } } };
}

function safeSlug(slug: string, title: string) {
  const normalized = (slug || title).toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return normalized || `course-${randomUUID().slice(0, 8)}`;
}

async function storePackageAssets(pkg: CoursePackageFiles): Promise<{ pathToKey: Map<string, string>; uploadedKeys: string[] }> {
  const pathToKey = new Map<string, string>();
  const uploadedKeys: string[] = [];
  try {
    for (const asset of pkg.manifest.assets) {
      const assetBytes = pkg.assets.get(asset.path);
      if (!assetBytes || !assetSignatureMatches(assetBytes, asset.contentType)) throw new Error(`Course media does not match its declared content type: ${asset.path}`);
      const key = `courses/imported/${randomUUID()}.${asset.path.split(".").pop()}`;
      await S3Client.send(new PutObjectCommand({ Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES, Key: key, ContentType: asset.contentType, ContentLength: asset.size, Body: assetBytes }));
      pathToKey.set(asset.path, key); uploadedKeys.push(key);
    }
    return { pathToKey, uploadedKeys };
  } catch (error) {
    if (uploadedKeys.length) await S3Client.send(new DeleteObjectsCommand({ Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES, Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) } })).catch(() => {});
    throw error;
  }
}

function resolvedKey(path: string | null, pathToKey: Map<string, string>): string | null {
  if (!path) return null;
  const key = pathToKey.get(path);
  if (!key) throw new Error(`Missing uploaded asset ${path}`);
  return key;
}

function createNestedCourseData(manifest: CoursePackageManifest, pathToKey: Map<string, string>, userId: string, organizationId: string, categories: Array<{ id: string }>, slug: string, status: "DRAFT" | "PUBLISHED" = "DRAFT") {
  return {
    title: manifest.course.title,
    description: manifest.course.description,
    smallDesc: manifest.course.smallDesc,
    duration: manifest.course.duration,
    level: manifest.course.level,
    slug,
    status,
    priceCents: manifest.course.priceCents,
    fileKey: resolvedKey(manifest.course.cover, pathToKey),
    userId,
    organizationId,
    stripePriceId: null,
    categories: { connect: categories },
    courseChapters: { create: manifest.chapters.map((chapter) => ({
      title: chapter.title, position: chapter.position,
      lessons: { create: chapter.lessons.map((lesson) => ({
        title: lesson.title, description: lesson.description, videoKey: resolvedKey(lesson.video, pathToKey), position: lesson.position,
        ...(lesson.legacyQuiz ? { quiz: mapQuizCreate(lesson.legacyQuiz) } : {}),
        cells: { create: lesson.cells.map((cell) => cell.type === "TEXT"
          ? { type: "TEXT" as const, position: cell.position, title: cell.title, textContent: convertTextMedia(cell.textContent, pathToKey, false) }
          : cell.type === "CODE_TASK"
            ? { type: "CODE_TASK" as const, position: cell.position, title: cell.title, taskPrompt: cell.taskPrompt, starterCode: cell.starterCode,
                examples: cell.examples as Prisma.InputJsonValue, testCases: cell.testCases as Prisma.InputJsonValue,
                ...(cell.lintConfig === null ? {} : { lintConfig: cell.lintConfig as Prisma.InputJsonValue }) }
            : { type: "QUIZ" as const, position: cell.position, title: cell.title, ...(cell.quiz ? { quiz: mapQuizCreate(cell.quiz) } : {}) }),
        },
      })) },
    })) },
  };
}

export async function importCoursePackage(input: { bytes: Uint8Array; organizationId: string; userId: string; includeProgress?: boolean; personalLearner?: boolean }): Promise<{ courseId: string; title: string; slug: string; progress: { importedLearners: number; skippedUnknownLearners: number; skippedLocations: number } }> {
  const pkg = parseCoursePackageZip(input.bytes);
  const manifest = pkg.manifest;
  const { pathToKey, uploadedKeys } = await storePackageAssets(pkg);
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.personalLearner) {
        const personalOrganization = await tx.organization.findFirst({ where: { id: input.organizationId, type: "PERSONAL", ownerUserId: input.userId }, select: { id: true } });
        if (!personalOrganization || input.includeProgress) throw new Error("Personal workspace import is not authorized");
      }
      const categories = await resolveCategories(manifest.course.categories, tx);
      const existing = await tx.course.findMany({ where: { organizationId: input.organizationId, slug: { startsWith: safeSlug(manifest.course.slug, manifest.course.title) } }, select: { slug: true } });
      const baseSlug = safeSlug(manifest.course.slug, manifest.course.title);
      const used = new Set(existing.map((row) => row.slug));
      let slug = baseSlug;
      let suffix = 2;
      while (used.has(slug)) { const ending = `-${suffix++}`; slug = `${baseSlug.slice(0, 50 - ending.length)}${ending}`; }
      const created = await tx.course.create({
        data: createNestedCourseData(manifest, pathToKey, input.userId, input.organizationId, categories.map(({ id }) => ({ id })), slug, input.personalLearner ? "PUBLISHED" : "DRAFT"),
        select: { id: true, title: true, slug: true, courseChapters: { orderBy: { position: "asc" }, select: { position: true, lessons: { orderBy: { position: "asc" }, select: { id: true, position: true, cells: { orderBy: { position: "asc" }, select: { id: true, position: true } } } } } } },
      });
      if (input.personalLearner) {
        await tx.enrollment.create({ data: { userId: input.userId, courseId: created.id, amount: 0, status: "Active", accessMode: "ALL_AT_ONCE" } });
      }
      let importedLearners = 0; let skippedUnknownLearners = 0; let skippedLocations = 0;
      const progress = input.includeProgress ? pkg.progress : undefined;
      if (progress) {
        const emails = [...new Set(progress.learners.map((learner) => learner.email.trim().toLowerCase()))];
        const memberships = await tx.organizationMembership.findMany({ where: { organizationId: input.organizationId, role: "STUDENT", user: { email: { in: emails, mode: "insensitive" } } }, select: { user: { select: { id: true, email: true } } } });
        const userByEmail = new Map(memberships.map(({ user }) => [user.email.trim().toLowerCase(), user.id]));
        const chapterByPosition = new Map(created.courseChapters.map((chapter) => [chapter.position, chapter]));
        for (const learner of progress.learners) {
          const userId = userByEmail.get(learner.email.trim().toLowerCase());
          if (!userId) { skippedUnknownLearners++; continue; }
          const lessonProgressData: Array<{ userId: string; lessonId: string; completed: boolean }> = [];
          const cellProgressData: Array<{ userId: string; lessonCellId: string; status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "PASSED"; attempts: number; passedAt?: Date }> = [];
          const lessonAt = (chapterPosition: number, lessonPosition: number) => chapterByPosition.get(chapterPosition)?.lessons.find((lesson) => lesson.position === lessonPosition);
          for (const row of learner.lessonCompletion) {
            const lesson = lessonAt(row.chapterPosition, row.lessonPosition);
            if (!lesson) { skippedLocations++; continue; }
            lessonProgressData.push({ userId, lessonId: lesson.id, completed: row.completed });
          }
          for (const row of learner.cells) {
            const cell = lessonAt(row.chapterPosition, row.lessonPosition)?.cells.find((candidate) => candidate.position === row.cellPosition);
            if (!cell) { skippedLocations++; continue; }
            cellProgressData.push({ userId, lessonCellId: cell.id, status: row.status, attempts: row.attempts, ...(row.status === "PASSED" ? { passedAt: new Date() } : {}) });
          }
          if (lessonProgressData.length || cellProgressData.length) {
            await tx.enrollment.create({ data: { userId, courseId: created.id, amount: 0, status: "Active", accessMode: "ALL_AT_ONCE" } });
            if (lessonProgressData.length) await tx.lessonProgress.createMany({ data: lessonProgressData, skipDuplicates: true });
            if (cellProgressData.length) await tx.lessonCellProgress.createMany({ data: cellProgressData, skipDuplicates: true });
            importedLearners++;
          }
        }
      }
      return { courseId: created.id, title: created.title, slug: created.slug, progress: { importedLearners, skippedUnknownLearners, skippedLocations } };
    });
    return result;
  } catch (error) {
    // Database failure means the imported media is no longer referenced.
    if (uploadedKeys.length) await S3Client.send(new DeleteObjectsCommand({ Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES, Delete: { Objects: uploadedKeys.map((Key) => ({ Key })) } })).catch(() => {});
    throw error;
  }
}

export function validateCourseProgress(value: unknown) { return courseProgressSchema.parse(value); }
