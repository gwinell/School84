import "server-only";
import { requireUser } from "./require-user";
import prisma from "@/lib/prisma";

export async function getMyQuizAttempts(cellId?: string) {
  const session = await requireUser();
  if (cellId) {
    const cell = await prisma.lessonCell.findUnique({ where: { id: cellId }, select: { id: true, lesson: { select: { chapter: { select: { courseId: true } } } } } });
    if (!cell) return [];
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: session.user.id, courseId: cell.lesson.chapter.courseId } }, select: { status: true } });
    if (session.user.role !== "admin" && enrollment?.status !== "Active") return [];
  }
  const rows = await prisma.quizAttempt.findMany({ where: { userId: session.user.id, ...(cellId ? { lessonCellId: cellId } : {}) }, orderBy: { submittedAt: "desc" }, take: 100, select: { id: true, lessonCellId: true, selectedAnswers: true, score: true, total: true, passed: true, submittedAt: true, feedback: { select: { score: true, comment: true, updatedAt: true } } } });
  return rows.map((row) => ({ ...row, selectedAnswers: safeAnswers(row.selectedAnswers) }));
}

function safeAnswers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    if (typeof item.questionId !== "string" || typeof item.questionText !== "string") return [];
    return [{ questionId: item.questionId, questionText: item.questionText, selectedAnswerIds: Array.isArray(item.selectedAnswerIds) ? item.selectedAnswerIds.filter((id): id is string => typeof id === "string") : [], selectedAnswerTexts: Array.isArray(item.selectedAnswerTexts) ? item.selectedAnswerTexts.filter((text): text is string => typeof text === "string") : [] }];
  });
}
