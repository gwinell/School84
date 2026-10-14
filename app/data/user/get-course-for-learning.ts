import "server-only";

import { notFound, redirect } from "next/navigation";

import prisma from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3/get-download-url";
import { getSequentiallyUnlockedLessonIds } from "@/lib/course-access";
import { requireUser } from "./require-user";

export type tCourseForLearningLesson = {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  position: number;
  completed: boolean;
  isUnlocked: boolean;
  cells: tCourseForLearningCell[];
};

export type tCourseForLearningCell = {
  id: string;
  position: number;
  type: "TEXT" | "CODE_TASK" | "QUIZ";
  title: string | null;
  status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "PASSED";
  textContent: string | null;
  taskPrompt: string | null;
  starterCode: string | null;
  examples: unknown;
  latestSubmission: {
    id: string;
    status: "ACCEPTED" | "WRONG_ANSWER" | "LINT_ERROR" | "RUNTIME_ERROR" | "TIME_LIMIT" | "SYSTEM_ERROR";
    passedTests: number;
    totalTests: number;
    actualOutput: string | null;
    errorText: string | null;
    lintOutput: string | null;
    durationMs: number;
    sourceCode: string;
    createdAt: Date;
    feedback: { score: number; comment: string; updatedAt: Date } | null;
  } | null;
  submissionHistory: {
    id: string;
    status: "ACCEPTED" | "WRONG_ANSWER" | "LINT_ERROR" | "RUNTIME_ERROR" | "TIME_LIMIT" | "SYSTEM_ERROR";
    passedTests: number;
    totalTests: number;
    actualOutput: string | null;
    errorText: string | null;
    lintOutput: string | null;
    durationMs: number;
    sourceCode: string;
    createdAt: Date;
    feedback: { score: number; comment: string; updatedAt: Date } | null;
  }[];
  quiz: {
    id: string;
    questions: {
      id: string;
      text: string;
      type: "SINGLE" | "MULTIPLE";
      answers: { id: string; text: string }[];
    }[];
  } | null;
};

export type tCourseForLearningChapter = {
  id: string;
  title: string;
  position: number;
  lessons: tCourseForLearningLesson[];
};

export type tCourseForLearning = {
  id: string;
  title: string;
  slug: string;
  smallDesc: string;
  imageUrl: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  accessMode: "ALL_AT_ONCE" | "SEQUENTIAL";
  courseChapters: tCourseForLearningChapter[];
};

async function signCellImages(textContent: string | null) {
  if (!textContent) return textContent;
  try {
    const json = JSON.parse(textContent) as Record<string, unknown>;
    const keys = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(visit);
      const record = value as Record<string, unknown>;
      const attrs = record.attrs as Record<string, unknown> | undefined;
      if (typeof attrs?.key === "string") keys.add(attrs.key);
      Object.values(record).forEach(visit);
    };
    visit(json);
    const signed = new Map(
      await Promise.all(
        Array.from(keys, async (key) => [key, await getDownloadUrl(key)] as const),
      ),
    );
    const apply = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(apply);
      const record = value as Record<string, unknown>;
      const attrs = record.attrs as Record<string, unknown> | undefined;
      if (attrs && typeof attrs.key === "string") {
        attrs.src = signed.get(attrs.key) ?? attrs.src;
      }
      Object.values(record).forEach(apply);
    };
    apply(json);
    return JSON.stringify(json);
  } catch {
    return textContent;
  }
}

export async function getCourseForLearning({
  slug,
  currentLessonId,
}: {
  slug: string;
  /**
   * When set, only this lesson's video is signed. Signing every lesson's video
   * on every call is wasteful and hands out shareable URLs for the whole course.
   */
  currentLessonId?: string;
}): Promise<tCourseForLearning> {
  const session = await requireUser();

  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      smallDesc: true,
      fileKey: true,
      status: true,
      courseChapters: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              videoKey: true,
              position: true,
              lessonProgress: {
                where: { userId: session.user.id },
                select: { completed: true },
              },
              cells: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  position: true,
                  type: true,
                  title: true,
                  textContent: true,
                  taskPrompt: true,
                  starterCode: true,
                  examples: true,
                  submissions: {
                    where: { userId: session.user.id },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                    select: {
                      id: true,
                      status: true,
                      passedTests: true,
                      totalTests: true,
                      actualOutput: true,
                      errorText: true,
                      lintOutput: true,
                      durationMs: true,
                      sourceCode: true,
                      createdAt: true,
                      feedback: { select: { score: true, comment: true, updatedAt: true } },
                    },
                  },
                  quiz: {
                    select: {
                      id: true,
                      questions: {
                        orderBy: { position: "asc" },
                        select: {
                          id: true,
                          text: true,
                          type: true,
                          answers: {
                            orderBy: { position: "asc" },
                            select: { id: true, text: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course || course.status !== "PUBLISHED") {
    notFound();
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      userId_courseId: {
        userId: session.user.id,
        courseId: course.id,
      },
    },
    select: { status: true, accessMode: true },
  });

  if (
    (!enrollment || enrollment.status !== "Active") &&
    session.user.role !== "admin"
  ) {
    redirect(`/courses/${slug}`);
  }

  const courseLessons = course.courseChapters.flatMap(
    (chapter) => chapter.lessons,
  );
  const accessMode = enrollment?.accessMode ?? "ALL_AT_ONCE";
  const courseCells = courseLessons.flatMap((lesson) => lesson.cells);

  if (courseCells.length > 0) {
    await prisma.lessonCellProgress.createMany({
      data: courseLessons.flatMap((lesson) =>
        lesson.cells.map((cell) => ({
          userId: session.user.id,
          lessonCellId: cell.id,
          status: accessMode === "ALL_AT_ONCE" || lesson.id === courseLessons[0]?.id
            ? ("AVAILABLE" as const)
            : ("LOCKED" as const),
        })),
      ),
      skipDuplicates: true,
    });
  }

  const cellProgress = await prisma.lessonCellProgress.findMany({
    where: {
      userId: session.user.id,
      lessonCell: { lesson: { chapter: { courseId: course.id } } },
    },
    select: { lessonCellId: true, status: true },
  });
  const cellStatusById = new Map(
    cellProgress.map((progress) => [progress.lessonCellId, progress.status]),
  );

  const unlockedLessonIds = accessMode === "ALL_AT_ONCE"
    ? new Set(courseLessons.map((lesson) => lesson.id))
    : getSequentiallyUnlockedLessonIds(
        courseLessons.map((lesson) => ({
          id: lesson.id,
          cells: lesson.cells.map((cell) => ({ id: cell.id, type: cell.type })),
        })),
        cellStatusById,
      );

  const lessons = course.courseChapters.flatMap((c) => c.lessons);

  const currentVideoKey = currentLessonId && unlockedLessonIds.has(currentLessonId)
    ? (lessons.find((l) => l.id === currentLessonId)?.videoKey ?? null)
    : null;

  const [imageUrl, currentVideoUrl] = await Promise.all([
    getDownloadUrl(course.fileKey),
    getDownloadUrl(currentVideoKey),
  ]);

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    smallDesc: course.smallDesc,
    imageUrl,
    status: course.status,
    accessMode,
    courseChapters: await Promise.all(course.courseChapters.map(async (chapter) => ({
      id: chapter.id,
      title: chapter.title,
      position: chapter.position,
      lessons: await Promise.all(chapter.lessons.map(async (lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: unlockedLessonIds.has(lesson.id) ? lesson.description : null,
        videoUrl: lesson.id === currentLessonId ? currentVideoUrl : null,
        position: lesson.position,
        completed: lesson.lessonProgress[0]?.completed ?? false,
        isUnlocked: unlockedLessonIds.has(lesson.id),
        cells: await Promise.all(lesson.cells.map(async (cell) => ({
          id: cell.id,
          position: cell.position,
          type: cell.type,
          title: cell.title,
          status: cellStatusById.get(cell.id) === "PASSED"
            ? "PASSED"
            : unlockedLessonIds.has(lesson.id)
              ? (cellStatusById.get(cell.id) === "IN_PROGRESS" ? "IN_PROGRESS" : "AVAILABLE")
              : "LOCKED",
          textContent: !unlockedLessonIds.has(lesson.id)
            ? null
            : await signCellImages(cell.textContent),
          taskPrompt: !unlockedLessonIds.has(lesson.id) ? null : cell.taskPrompt,
          starterCode: !unlockedLessonIds.has(lesson.id) ? null : cell.starterCode,
          examples: !unlockedLessonIds.has(lesson.id) ? null : cell.examples,
          latestSubmission: !unlockedLessonIds.has(lesson.id) ? null : cell.submissions[0] ?? null,
          submissionHistory: !unlockedLessonIds.has(lesson.id) ? [] : cell.submissions,
          quiz: !unlockedLessonIds.has(lesson.id) ? null : cell.quiz,
        }))),
      }))),
    }))),
  };
}
