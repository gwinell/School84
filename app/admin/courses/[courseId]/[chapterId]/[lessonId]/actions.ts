"use server";

import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import {
  type LessonQuizSchemaType,
  type LessonSchemaType,
  lessonQuizSchema,
  lessonSchema,
} from "@/lib/zodSchemas";
import { z } from "zod";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { canUseCourseMediaKeys } from "@/lib/teacher/course-media";
import arcjet, { detectBot, fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { adminLog, safeAdminLog } from "@/lib/activity/admin-log";
import {
  buildLessonFieldChanges,
  snapshotLesson,
} from "@/lib/activity/snapshots/lesson";
import {
  buildQuizFieldChanges,
  snapshotQuiz,
} from "@/lib/activity/snapshots/quiz";
import { isCompletePermutation } from "@/lib/reorder";

const aj = arcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    }),
  )
  .withRule(
    fixedWindow({
      mode: "LIVE",
      window: "1m",
      max: 10,
    }),
  );

const quizAj = arcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    }),
  )
  .withRule(
    fixedWindow({
      mode: "LIVE",
      window: "1m",
      max: 20,
    }),
  );

export async function updateLesson(lessonId: string, values: LessonSchemaType) {
  const session = await requireTeacher();
  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests", null);
    }

    const validatedData = lessonSchema.safeParse(values);

    if (!validatedData.success) {
      return errorResponse("Invalid data", z.treeifyError(validatedData.error));
    }

    const { session: courseSession } = await requireCourseTeacher(validatedData.data.courseId);
    const before = await prisma.lesson.findFirst({
      where: { id: lessonId, chapterId: validatedData.data.chapterId, chapter: { courseId: validatedData.data.courseId } },
      select: {
        id: true,
        title: true,
        description: true,
        position: true,
        videoKey: true,
      },
    });

    if (!before) {
      return errorResponse("Lesson not found", null);
    }

    const nextVideoKey = validatedData.data.videoKey ?? null;
    if (!(await canUseCourseMediaKeys({
      keys: nextVideoKey ? [nextVideoKey] : [],
      existingKeys: before.videoKey ? [before.videoKey] : [],
      courseId: validatedData.data.courseId,
      userId: courseSession.user.id,
      role: courseSession.user.role,
    }))) {
      return errorResponse("Video upload is not available", null);
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: validatedData.data.name,
        description: validatedData.data.description ?? null,
        videoKey: validatedData.data.videoKey ?? null,
      },
    });

    if (nextVideoKey && nextVideoKey !== before.videoKey) {
      await prisma.pendingUpload
        .deleteMany({
          where: {
            key: nextVideoKey,
            ...(courseSession.user.role === "admin"
              ? {}
              : { userId: courseSession.user.id, courseId: validatedData.data.courseId }),
          },
        })
        .catch(() => {});
    }

    const beforeSnapshot = snapshotLesson(before);
    const afterSnapshot = snapshotLesson(lesson);
    const changedFields = buildLessonFieldChanges(
      beforeSnapshot,
      afterSnapshot,
    );

    if (Object.keys(changedFields).length > 0) {
      await safeAdminLog({
        action: "LESSON_UPDATED",
        entityType: "LESSON",
        entityId: lesson.id,
        entityLabel: lesson.title,
        metadata: {
          courseId: validatedData.data.courseId,
          chapterId: validatedData.data.chapterId,
          fields: changedFields,
        },
      });
    }

    revalidatePath(
      `/admin/courses/${validatedData.data.courseId}/${validatedData.data.chapterId}/${lessonId}`,
    );
    revalidatePath(`/admin/courses/${validatedData.data.courseId}/edit`);

    return successResponse("Lesson updated successfully", lesson);
  } catch {
    return errorResponse("Failed to update lesson", null);
  }
}

async function findCellContext(cellId: string) {
  const session = await requireTeacher();
  const managedCourseIds = session.user.role === "admin"
    ? null
    : (await prisma.courseInstructor.findMany({ where: { userId: session.user.id }, select: { courseId: true } })).map((row) => row.courseId);
  const cell = await prisma.lessonCell.findFirst({
    where: { id: cellId, ...(managedCourseIds ? { lesson: { chapter: { courseId: { in: managedCourseIds } } } } : {}) },
    select: {
      lessonId: true,
      lesson: {
        select: {
          title: true,
          chapterId: true,
          chapter: { select: { courseId: true } },
        },
      },
    },
  });
  if (!cell) return null;
  return {
    courseId: cell.lesson.chapter.courseId,
    chapterId: cell.lesson.chapterId,
    lessonId: cell.lessonId,
    lessonTitle: cell.lesson.title,
  };
}

export async function upsertLessonQuiz(
  cellId: string,
  values: Omit<LessonQuizSchemaType, "lessonId">,
) {
  const session = await requireTeacher();

  try {
    const req = await request();
    const decision = await quizAj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests", null);
    }

    const parsed = lessonQuizSchema.omit({ lessonId: true }).safeParse(values);

    if (!parsed.success) {
      return errorResponse("Invalid data", z.treeifyError(parsed.error));
    }

    const ctx = await findCellContext(cellId);
    if (!ctx) {
      return errorResponse("Lesson not found", null);
    }

    const { questions } = parsed.data;

    const existingQuiz = await prisma.quiz.findUnique({
      where: { cellId },
      select: {
        id: true,
        questions: { select: { type: true } },
      },
    });
    const wasCreated = !existingQuiz;

    const beforeSnapshot = existingQuiz
      ? snapshotQuiz(existingQuiz)
      : null;

    await prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.upsert({
        where: { cellId },
        update: {},
        create: { cellId },
        select: { id: true },
      });

      // Delete-and-reinsert keeps the authoring flow simple and bounded;
      // questions and answers are a small, fully admin-owned dataset where
      // diffing would add complexity without saving meaningful work.
      await tx.quizQuestion.deleteMany({
        where: { quizId: quiz.id },
      });

      for (let qIndex = 0; qIndex < questions.length; qIndex++) {
        const question = questions[qIndex];
        if (!question) continue;

        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            text: question.text,
            type: question.type,
            position: qIndex,
            answers: {
              create: question.answers.map((answer, aIndex) => ({
                text: answer.text,
                isCorrect: answer.isCorrect,
                explanation: answer.explanation ?? null,
                position: aIndex,
              })),
            },
          },
        });
      }

      const afterSnapshot = snapshotQuiz({
        id: quiz.id,
        questions: questions.map((q) => ({ type: q.type })),
      });
      const changedFields = beforeSnapshot
        ? buildQuizFieldChanges(beforeSnapshot, afterSnapshot)
        : { questionsCount: { from: 0, to: afterSnapshot.questionsCount } };

      await adminLog(
        {
          action: wasCreated ? "QUIZ_CREATED" : "QUIZ_UPDATED",
          entityType: "QUIZ",
          entityId: quiz.id,
          entityLabel: ctx.lessonTitle
            ? `Quiz: ${ctx.lessonTitle}`
            : null,
          metadata: {
            courseId: ctx.courseId,
            chapterId: ctx.chapterId,
            lessonId: ctx.lessonId,
            fields: changedFields,
            ...(wasCreated ? { questionsCount: questions.length } : {}),
          },
        },
        tx,
      );
    });

    const savedQuiz = await prisma.quiz.findUnique({
      where: { cellId },
      select: {
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            text: true,
            type: true,
            answers: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                text: true,
                isCorrect: true,
                explanation: true,
              },
            },
          },
        },
      },
    });

    return successResponse("Quiz saved successfully", savedQuiz);
  } catch {
    return errorResponse("Failed to save quiz", null);
  }
}

const reorderQuizQuestionsSchema = z.object({
  cellId: z.string().cuid(),
  questions: z.array(
    z.object({
      id: z.string().cuid(),
      position: z.number().int().min(0),
    }),
  ),
});

interface iReorderQuizQuestionsProps {
  cellId: string;
  questions: { id: string; position: number }[];
}

export async function reorderQuizQuestions({
  cellId,
  questions,
}: iReorderQuizQuestionsProps) {
  try {
    const parsed = reorderQuizQuestionsSchema.safeParse({
      cellId,
      questions,
    });

    if (!parsed.success) {
      return errorResponse("Invalid data", z.treeifyError(parsed.error));
    }

    await requireTeacher();

    const ctx = await findCellContext(cellId);
    if (!ctx) {
      return errorResponse("Lesson not found", null);
    }

    const quiz = await prisma.quiz.findUnique({
      where: { cellId },
      select: { id: true },
    });

    if (!quiz) {
      return errorResponse("Quiz not found", null);
    }

    const existingQuestions = await prisma.quizQuestion.findMany({
      where: { quizId: quiz.id },
      select: { id: true },
    });

    if (
      !isCompletePermutation(
        parsed.data.questions,
        existingQuestions.map((question) => question.id),
        0,
      )
    ) {
      return errorResponse("Invalid question order", null);
    }

    // Two-step update to avoid @@unique([quizId, position]) violations:
    // first move every row to a temporary negative position, then set final.
    const tempUpdates = parsed.data.questions.map((question, index) =>
      prisma.quizQuestion.update({
        where: { id: question.id },
        data: { position: -(index + 1) },
      }),
    );
    const finalUpdates = parsed.data.questions.map((question) =>
      prisma.quizQuestion.update({
        where: { id: question.id },
        data: { position: question.position },
      }),
    );

    await prisma.$transaction([...tempUpdates, ...finalUpdates]);

    return successResponse("Questions reordered successfully", null);
  } catch {
    return errorResponse("Failed to reorder questions", null);
  }
}
