"use server";

import { z } from "zod";
import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";
import { canAccessAssignedLesson } from "@/lib/course-access";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";

export async function setLastVisitedLearningPosition(input: unknown) {
  const session = await requireUser();
  const parsed = z.object({ courseId: z.string().min(1), lessonId: z.string().min(1), cellId: z.string().min(1).nullable().optional() }).safeParse(input);
  if (!parsed.success) return errorResponse("Место в курсе не найдено", null);
  const lesson = await prisma.lesson.findUnique({ where: { id: parsed.data.lessonId }, select: { id: true, chapter: { select: { courseId: true, course: { select: { slug: true, status: true, organizationId: true } } } }, cells: { select: { id: true } } } });
  if (!lesson || lesson.chapter.courseId !== parsed.data.courseId || lesson.chapter.course.status !== "PUBLISHED") return errorResponse("Место в курсе недоступно", null);
  if (parsed.data.cellId && !lesson.cells.some((cell) => cell.id === parsed.data.cellId)) return errorResponse("Элемент не относится к уроку", null);
  const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId: parsed.data.courseId, organizationId: lesson.chapter.course.organizationId });
  if (!enrollment) return errorResponse("Курс не назначен вашему аккаунту", null);
  if (session.user.role !== "admin" && enrollment?.accessMode === "SEQUENTIAL" && !(await canAccessAssignedLesson({ userId: session.user.id, courseId: parsed.data.courseId, lessonId: lesson.id }))) return errorResponse("Урок ещё закрыт", null);
  await prisma.learningCursor.upsert({ where: { userId_courseId: { userId: session.user.id, courseId: parsed.data.courseId } }, create: { userId: session.user.id, courseId: parsed.data.courseId, lessonId: lesson.id, cellId: parsed.data.cellId ?? null }, update: { lessonId: lesson.id, cellId: parsed.data.cellId ?? null } });
  return successResponse("Позиция сохранена", { courseId: parsed.data.courseId, lessonId: lesson.id, cellId: parsed.data.cellId ?? null });
}
