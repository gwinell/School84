import "server-only";

import { requireCourseTeacher } from "./require-course-teacher";
import { requireTeacher } from "./require-teacher";
import prisma from "@/lib/prisma";
import { isSubmissionLate } from "@/lib/teacher/deadline";

export async function adminGetTeachingCourses() {
  const session = await requireTeacher();
  return prisma.course.findMany({
    where: session.user.role === "admin"
      ? undefined
      : { instructors: { some: { userId: session.user.id } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, slug: true, status: true },
  });
}

export async function getCourseGradebook(courseId: string) {
  await requireCourseTeacher(courseId);
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      instructors: { select: { user: { select: { id: true, name: true, email: true } } } },
      enrollment: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, accessMode: true, dueAt: true, createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      courseChapters: {
        select: { lessons: { select: { id: true, cells: { select: { id: true } } } } },
      },
    },
  });
  const userIds = course.enrollment.map((e) => e.user.id);
  const cellIds = course.courseChapters.flatMap((c) => c.lessons.flatMap((l) => l.cells.map((x) => x.id)));
  const [progress, submissions, attempts, activity, cursors] = await Promise.all([
    prisma.lessonCellProgress.findMany({ where: { userId: { in: userIds }, lessonCellId: { in: cellIds } }, select: { userId: true, lessonCellId: true, status: true } }),
    prisma.codeSubmission.findMany({
      where: { userId: { in: userIds }, lessonCellId: { in: cellIds } },
      orderBy: { createdAt: "desc" }, take: 500,
      select: { id: true, userId: true, lessonCellId: true, sourceCode: true, status: true, passedTests: true, totalTests: true, actualOutput: true, errorText: true, createdAt: true, lessonCell: { select: { title: true, lesson: { select: { title: true } } } }, feedback: { select: { score: true, comment: true, reviewer: { select: { name: true } }, updatedAt: true } } },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: { in: userIds }, lessonCellId: { in: cellIds } },
      orderBy: { submittedAt: "desc" }, take: 500,
      select: { id: true, userId: true, lessonCellId: true, selectedAnswers: true, score: true, total: true, passed: true, submittedAt: true, lessonCell: { select: { title: true, lesson: { select: { title: true } } } }, feedback: { select: { score: true, comment: true, reviewer: { select: { name: true } }, updatedAt: true } } },
    }),
    prisma.learningActivityHeartbeat.findMany({ where: { userId: { in: userIds }, lessonCellId: { in: cellIds } }, orderBy: { occurredAt: "desc" }, distinct: ["userId"], select: { userId: true, occurredAt: true } }),
    prisma.learningCursor.findMany({ where: { courseId }, select: { userId: true, lessonId: true, cellId: true, updatedAt: true } }),
  ]);
  const totalCells = cellIds.length;
  return {
    id: course.id,
    title: course.title,
    instructors: course.instructors.map(({ user }) => user),
    students: course.enrollment.map((enrollment) => {
      const userId = enrollment.user.id;
      const ownProgress = progress.filter((p) => p.userId === userId);
      const ownSubs = submissions.filter((s) => s.userId === userId);
      const ownAttempts = attempts.filter((a) => a.userId === userId);
      return {
        user: enrollment.user,
        enrollment: { id: enrollment.id, status: enrollment.status, accessMode: enrollment.accessMode, dueAt: enrollment.dueAt, createdAt: enrollment.createdAt },
        progress: { completedCells: ownProgress.filter((p) => p.status === "PASSED").length, totalCells, percent: totalCells ? Math.round(100 * ownProgress.filter((p) => p.status === "PASSED").length / totalCells) : 0, lastActiveAt: activity.find((a) => a.userId === userId)?.occurredAt ?? null, cursor: cursors.find((c) => c.userId === userId) ?? null },
        codeSubmissions: ownSubs.map((submission) => ({ ...submission, isLate: isSubmissionLate(submission.createdAt, enrollment.dueAt) })),
        quizAttempts: ownAttempts.map((attempt) => ({ ...attempt, isLate: isSubmissionLate(attempt.submittedAt, enrollment.dueAt), selectedAnswers: safeSelectedAnswers(attempt.selectedAnswers) })),
      };
    }),
  };
}

function safeSelectedAnswers(value: unknown): Array<{ questionId: string; questionText: string; selectedAnswerIds: string[]; selectedAnswerTexts: string[] }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => row && typeof row === "object" && "questionId" in row && "questionText" in row && "selectedAnswerIds" in row && "selectedAnswerTexts" in row
    ? [{ questionId: String(row.questionId), questionText: String(row.questionText), selectedAnswerIds: Array.isArray(row.selectedAnswerIds) ? (row.selectedAnswerIds as unknown[]).filter((x: unknown): x is string => typeof x === "string") : [], selectedAnswerTexts: Array.isArray(row.selectedAnswerTexts) ? (row.selectedAnswerTexts as unknown[]).filter((x: unknown): x is string => typeof x === "string") : [] }]
    : []);
}

export async function getAssignableTeachers() {
  const session = await requireTeacher();
  if (session.user.role !== "admin") return [];
  return prisma.user.findMany({
    // BetterAuth creates regular accounts with role="user". Include those
    // candidates so admins can promote them when assigning a course teacher;
    // retain null-role accounts created before role provisioning.
    where: { OR: [{ role: "teacher" }, { role: "user" }, { role: null }] },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function getCourseInvitations(courseId: string) {
  await requireCourseTeacher(courseId);
  return prisma.courseInvitation.findMany({
    where: { courseId }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, email: true, accessMode: true, dueAt: true, expiresAt: true, acceptedAt: true, createdAt: true },
  });
}

export async function getCourseInstructors(courseId: string) {
  await requireCourseTeacher(courseId);
  const rows = await prisma.courseInstructor.findMany({
    where: { courseId }, orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map(({ user }) => user);
}
