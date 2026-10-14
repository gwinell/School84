import "server-only";
import { requireUser } from "./require-user";
import prisma from "@/lib/prisma";

export async function getMyQuizAttempts(cellId?: string) {
  const session = await requireUser();
  if (cellId) {
    const cell = await prisma.lessonCell.findUnique({ where: { id: cellId }, select: { id: true, lesson: { select: { chapter: { select: { courseId: true, course: { select: { organizationId: true } } } } } } } });
    if (!cell) return [];
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: session.user.id, courseId: cell.lesson.chapter.courseId } }, select: { status: true } });
    const membership = session.user.role === "admin" ? { role: "STUDENT" } : await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: cell.lesson.chapter.course.organizationId, userId: session.user.id } }, select: { role: true } });
    if (session.user.role !== "admin" && (enrollment?.status !== "Active" || membership?.role !== "STUDENT")) return [];
  }
  const where = {
    userId: session.user.id,
    ...(cellId ? { lessonCellId: cellId } : {}),
    ...(session.user.role === "admin" ? {} : {
      lessonCell: { is: {
        lesson: { is: {
          chapter: { is: {
            course: { is: {
              organization: { is: { memberships: { some: { userId: session.user.id, role: "STUDENT" as const } } } },
              enrollment: { some: { userId: session.user.id, status: "Active" as const } },
            } },
            },
        } },
      } },
      },
    }),
  };
  const rows = await prisma.quizAttempt.findMany({ where, orderBy: { submittedAt: "desc" }, take: 100, select: { id: true, lessonCellId: true, selectedAnswers: true, score: true, total: true, passed: true, submittedAt: true, feedback: { select: { score: true, comment: true, updatedAt: true } } } });
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
