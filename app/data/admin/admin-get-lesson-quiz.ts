import "server-only";

import prisma from "@/lib/prisma";
import { requireAdmin } from "./require-admin";

type TAdminGetLessonQuizProps = {
  cellId: string;
};

export async function adminGetLessonQuiz({
  cellId,
}: TAdminGetLessonQuizProps) {
  await requireAdmin();

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
