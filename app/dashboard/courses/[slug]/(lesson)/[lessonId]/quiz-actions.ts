"use server";

import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";
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
                  course: { select: { status: true, organizationId: true } },
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
                      course: { select: { status: true, organizationId: true } },
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

  const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId: chapter.courseId, organizationId: chapter.course.organizationId });
  if (!enrollment) return null;
  if (session.user.role !== "admin") {
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
