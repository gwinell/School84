"use server";

import { requireUser } from "@/app/data/user/require-user";
import { canAccessAssignedLesson } from "@/lib/course-access";
import prisma from "@/lib/prisma";

export type tQuizGrade = {
  correctAnswerIds: string[];
  explanations: Record<string, string>;
  isCorrect: boolean;
};

type TGradeQuizAnswerAction = {
  questionId: string;
  selectedAnswerIds: string[];
};

/**
 * Grades a single quiz question server-side and returns only the correctness of
 * the answers that were just submitted. This keeps `isCorrect`/`explanation`
 * off the client until the learner has actually answered.
 */
export async function gradeQuizAnswerAction({
  questionId,
  selectedAnswerIds,
}: TGradeQuizAnswerAction): Promise<tQuizGrade | null> {
  const session = await requireUser();

  const question = await prisma.quizQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      quiz: {
        select: {
          lesson: {
            select: {
              id: true,
              chapter: {
                select: {
                  courseId: true,
                  course: { select: { status: true } },
                },
              },
            },
          },
          cell: {
            select: {
              lesson: {
                select: {
                  id: true,
                  chapter: {
                    select: {
                      courseId: true,
                      course: { select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: {
        select: { id: true, isCorrect: true, explanation: true },
      },
    },
  });

  if (!question) return null;

  const lesson = question.quiz.lesson ?? question.quiz.cell?.lesson;
  if (!lesson) return null;
  const chapter = lesson.chapter;
  if (chapter.course.status !== "PUBLISHED") return null;

  if (session.user.role !== "admin") {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId: chapter.courseId,
        },
      },
      select: { status: true, accessMode: true },
    });

    if (!enrollment || enrollment.status !== "Active") {
      return null;
    }
    if (
      enrollment.accessMode === "SEQUENTIAL" &&
      !(await canAccessAssignedLesson({
        userId: session.user.id,
        courseId: chapter.courseId,
        lessonId: lesson.id,
      }))
    ) {
      return null;
    }
  }

  const correctAnswerIds = question.answers
    .filter((a) => a.isCorrect)
    .map((a) => a.id);

  const selected = new Set(selectedAnswerIds);
  const isCorrect =
    selected.size === correctAnswerIds.length &&
    correctAnswerIds.every((id) => selected.has(id));

  const explanations: Record<string, string> = {};
  for (const answer of question.answers) {
    if (answer.explanation) explanations[answer.id] = answer.explanation;
  }

  return { correctAnswerIds, explanations, isCorrect };
}
