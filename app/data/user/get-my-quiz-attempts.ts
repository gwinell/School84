import "server-only";
import { requireUser } from "./require-user";
import prisma from "@/lib/prisma";
import { getCourseLearnerAccess } from "./course-learner-access";

export async function getMyQuizAttempts(cellId?: string) {
  const session = await requireUser();
  let authorizedCourseIds: string[] | null = null;
  if (cellId) {
    const cell = await prisma.lessonCell.findUnique({ where: { id: cellId }, select: { id: true, lesson: { select: { chapter: { select: { courseId: true, course: { select: { organizationId: true } } } } } } } });
    if (!cell) return [];
    const courseId = cell.lesson.chapter.courseId;
    const access = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId, organizationId: cell.lesson.chapter.course.organizationId });
    if (!access) return [];
    authorizedCourseIds = [courseId];
  } else if (session.user.role !== "admin") {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "Active", course: { organization: { OR: [
        { type: "SCHOOL", memberships: { some: { userId: session.user.id, role: "STUDENT" } } },
        { type: "PERSONAL", ownerUserId: session.user.id },
      ] } } },
      select: { courseId: true },
    });
    authorizedCourseIds = enrollments.map(({ courseId }) => courseId);
  }
  if (authorizedCourseIds && authorizedCourseIds.length === 0) return [];
  const where = {
    userId: session.user.id,
    ...(cellId ? { lessonCellId: cellId } : {}),
    ...(authorizedCourseIds ? {
      lessonCell: {
        is: {
          lesson: {
            is: {
              chapter: { is: { courseId: { in: authorizedCourseIds } } },
            },
          },
        },
      },
    } : {}),
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
