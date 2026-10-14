import "server-only";

import prisma from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3/get-download-url";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { getManagedCourseIds } from "@/app/data/teacher/get-managed-course-ids";
import { notFound } from "next/navigation";

async function signInlineImages(textContent: string | null) {
  if (!textContent) return textContent;
  try {
    const json = JSON.parse(textContent) as Record<string, unknown>;
    const keys = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
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
      if (Array.isArray(value)) {
        value.forEach(apply);
        return;
      }
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

type TAdminGetLessonProps = {
  id: string;
};

export async function adminGetLesson({ id }: TAdminGetLessonProps) {
  const session = await requireTeacher();
  const managedCourseIds = await getManagedCourseIds(session.user.id, session.user.role);
  const scopedWhere = { id, ...(managedCourseIds ? { chapter: { courseId: { in: managedCourseIds } } } : {}) };

  // Preserve KnowSphere lessons created before the cell editor existed.
  // Their notes and quiz are moved into ordered cells the first time an
  // administrator opens the editor.
  const legacyLesson = await prisma.lesson.findFirst({
    where: scopedWhere,
    select: {
      description: true,
      cells: { select: { id: true, position: true, type: true } },
      quiz: { select: { id: true, cellId: true } },
    },
  });
  if (legacyLesson) {
    const shouldMoveNotes =
      legacyLesson.cells.length === 0 && Boolean(legacyLesson.description);
    const shouldMoveQuiz = Boolean(
      legacyLesson.quiz && !legacyLesson.quiz.cellId,
    );
    if (shouldMoveNotes || shouldMoveQuiz) {
      await prisma.$transaction(async (tx) => {
        let nextPosition =
          Math.max(0, ...legacyLesson.cells.map((cell) => cell.position)) + 1;
        if (shouldMoveNotes) {
          await tx.lessonCell.create({
            data: {
              lessonId: id,
              position: 1,
              type: "TEXT",
              title: "Конспект",
              textContent: legacyLesson.description,
            },
          });
          nextPosition = 2;
        }
        if (shouldMoveQuiz && legacyLesson.quiz) {
          const cell = await tx.lessonCell.create({
            data: {
              lessonId: id,
              position: nextPosition,
              type: "QUIZ",
              title: "Проверка знаний",
            },
            select: { id: true },
          });
          await tx.quiz.update({
            where: { id: legacyLesson.quiz.id },
            data: { cellId: cell.id },
          });
        }
      });
    }
  }

  const data = await prisma.lesson.findFirst({
    where: scopedWhere,
    select: {
      title: true,
      videoKey: true,
      description: true,
      id: true,
      position: true,
      chapterId: true,
      chapter: {
        select: {
          id: true,
          title: true,
          courseId: true,
          course: {
            select: {
              title: true,
              courseChapters: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  lessons: {
                    orderBy: { position: "asc" },
                    select: { id: true, title: true },
                  },
                },
              },
            },
          },
        },
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
          testCases: true,
          lintConfig: true,
          quiz: {
            select: {
              id: true,
              questions: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  text: true,
                  type: true,
                  position: true,
                  answers: {
                    orderBy: { position: "asc" },
                    select: {
                      id: true,
                      text: true,
                      isCorrect: true,
                      explanation: true,
                      position: true,
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

  if (!data) {
    return notFound();
  }

  const videoUrl = await getDownloadUrl(data.videoKey);

  return {
    ...data,
    videoUrl,
    cells: await Promise.all(
      data.cells.map(async (cell) => ({
        ...cell,
        textContent: await signInlineImages(cell.textContent),
      })),
    ),
  };
}

export type TAdminGetLesson = Awaited<ReturnType<typeof adminGetLesson>>;
