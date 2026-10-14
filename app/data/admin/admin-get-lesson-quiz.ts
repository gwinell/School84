import "server-only";

import prisma from "@/lib/prisma";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { getManagedCourseIds } from "@/app/data/teacher/get-managed-course-ids";

type TAdminGetLessonQuizProps = {
  cellId: string;
};

export async function adminGetLessonQuiz({
  cellId,
}: TAdminGetLessonQuizProps) {
  const session = await requireTeacher();
  const managedCourseIds = await getManagedCourseIds(session.user.id, session.user.role);
  const cell = await prisma.lessonCell.findFirst({ where: { id: cellId, ...(managedCourseIds ? { lesson: { chapter: { courseId: { in: managedCourseIds } } } } : {}) }, select: { id: true } });
  if (!cell) return null;

  const quiz = await prisma.quiz.findUnique({
    where: { cellId },
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
  });

  if (!quiz) {
    return null;
  }

  return quiz;
}

export type TAdminGetLessonQuiz = NonNullable<
  Awaited<ReturnType<typeof adminGetLessonQuiz>>
>;
