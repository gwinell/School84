"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/app/data/user/require-user";
import { canAccessAssignedLesson } from "@/lib/course-access";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import type { tApiResponse } from "@/types/api";

export async function passLessonCellAction({
  cellId,
  quizAnswers,
}: {
  cellId: string;
  quizAnswers?: Record<string, string[]>;
}): Promise<tApiResponse<{ nextCellId: string | null; score?: number; total?: number } | null>> {
  const session = await requireUser();
  const input = z.object({
    cellId: z.string().min(1),
    quizAnswers: z.record(z.string(), z.array(z.string().min(1)).max(100)).optional(),
  }).safeParse({ cellId, quizAnswers });
  if (!input.success) return errorResponse("Invalid cell progress", null);
  const cell = await prisma.lessonCell.findUnique({
    where: { id: cellId },
    select: {
      id: true,
      lessonId: true,
      type: true,
      quiz: { select: { questions: { select: {
        id: true, text: true, answers: { select: { id: true, text: true, isCorrect: true } },
      } } } },
      lesson: {
        select: {
          chapter: {
            select: {
              course: { select: { id: true, slug: true, status: true } },
            },
          },
        },
      },
    },
  });

  if (!cell || cell.lesson.chapter.course.status !== "PUBLISHED") {
    return errorResponse("Cell not found", null);
  }
  if (cell.type === "CODE_TASK") {
    return errorResponse("Python task progress is updated only after server validation", null);
  }

  const course = cell.lesson.chapter.course;
  if (session.user.role !== "admin") {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId: course.id },
      },
    select: { status: true, accessMode: true },
    });
    if (!enrollment || enrollment.status !== "Active") {
      return errorResponse("You are not assigned to this course", null);
    }
    if (
      enrollment.accessMode === "SEQUENTIAL" &&
      !(await canAccessAssignedLesson({
        userId: session.user.id,
        courseId: course.id,
        lessonId: cell.lessonId,
      }))
    ) {
      return errorResponse("Complete all accepted tasks in previous lessons first", null);
    }
  }

  let quizAttemptPassed = false;
  if (cell.type === "QUIZ") {
    const answers = input.data.quizAnswers;
    const questions = cell.quiz?.questions ?? [];
    if (questions.length === 0) return errorResponse("В этом тесте пока нет вопросов", { nextCellId: null });
    let score = 0;
    const selectedAnswers = questions.map((question) => {
      const selected = [...new Set((answers?.[question.id] ?? []).filter((answerId) => question.answers.some((answer) => answer.id === answerId)))];
      const correctIds = question.answers.filter((answer) => answer.isCorrect).map((answer) => answer.id);
      const isCorrect = correctIds.length > 0 && selected.length === correctIds.length && correctIds.every((id) => selected.includes(id));
      if (isCorrect) score++;
      return {
        questionId: question.id,
        questionText: question.text,
        selectedAnswerIds: selected,
        selectedAnswerTexts: question.answers.filter((answer) => selected.includes(answer.id)).map((answer) => answer.text),
      };
    });
    quizAttemptPassed = score === questions.length;
    await prisma.quizAttempt.create({ data: { userId: session.user.id, lessonCellId: cell.id, selectedAnswers, score, total: questions.length, passed: quizAttemptPassed } });
    if (!quizAttemptPassed) return errorResponse("Ответьте правильно на все вопросы, чтобы завершить тест", { nextCellId: null, score, total: questions.length });
  }

  const siblings = await prisma.lessonCell.findMany({
    where: { lessonId: cell.lessonId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const currentIndex = siblings.findIndex((sibling) => sibling.id === cellId);
  if (currentIndex < 0) return errorResponse("Cell not found", null);

  await prisma.$transaction(async (tx) => {
    await tx.lessonCellProgress.upsert({
      where: { userId_lessonCellId: { userId: session.user.id, lessonCellId: cellId } },
      create: {
        userId: session.user.id,
        lessonCellId: cellId,
        status: "PASSED",
        passedAt: new Date(),
      },
      update: { status: "PASSED", passedAt: new Date() },
    });

    const allPassed = siblings.length > 0
      ? (await tx.lessonCellProgress.count({
          where: {
            userId: session.user.id,
            lessonCellId: { in: siblings.map((sibling) => sibling.id) },
            status: "PASSED",
          },
        })) === siblings.length
      : false;

    if (allPassed) {
      await tx.lessonProgress.upsert({
        where: {
          userId_lessonId: { userId: session.user.id, lessonId: cell.lessonId },
        },
        create: {
          userId: session.user.id,
          lessonId: cell.lessonId,
          completed: true,
        },
        update: { completed: true },
      });
    }
  });

  revalidatePath(`/dashboard/courses/${course.slug}/${cell.lessonId}`);
  revalidatePath(`/dashboard/courses/${course.slug}`);
  revalidatePath("/dashboard");
  return successResponse("Cell passed", {
    nextCellId: siblings[currentIndex + 1]?.id ?? null,
  });
}
