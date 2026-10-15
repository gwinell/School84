import "server-only";

import prisma from "@/lib/prisma";
import { canAccessAssignedLesson } from "@/lib/course-access";
import { requireUser } from "./require-user";
import { getCourseLearnerAccess } from "./course-learner-access";

export type tUserQuizAnswer = {
  id: string;
  text: string;
};

export type tUserQuizQuestion = {
  id: string;
  text: string;
  type: "SINGLE" | "MULTIPLE";
  answers: tUserQuizAnswer[];
};

export type tUserLessonQuiz = {
  id: string;
  questions: tUserQuizQuestion[];
};

type TGetLessonQuizForUserProps = {
  lessonId: string;
};

export async function getLessonQuizForUser({
  lessonId,
}: TGetLessonQuizForUserProps): Promise<tUserLessonQuiz | null> {
  const session = await requireUser();

  // Resolve the owning course and enforce published + active enrollment so this
  // fetcher can be safely reused from any entry point.
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      chapter: {
        select: {
          courseId: true,
      course: { select: { status: true, organizationId: true } },
        },
      },
    },
  });

  if (!lesson || lesson.chapter.course.status !== "PUBLISHED") {
    return null;
  }

  if (session.user.role !== "admin") {
    const enrollment = await getCourseLearnerAccess({
      userId: session.user.id,
      userRole: session.user.role,
      courseId: lesson.chapter.courseId,
      organizationId: lesson.chapter.course.organizationId,
    });
    if (!enrollment) {
      return null;
    }
    if (enrollment.accessMode === "SEQUENTIAL" && !(await canAccessAssignedLesson({
      userId: session.user.id, courseId: lesson.chapter.courseId, lessonId,
    }))) return null;
  }

  // Deliberately excludes `isCorrect`/`explanation` — grading happens in a
  // server action so answers never reach the client before submission.
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    select: {
      id: true,
      questions: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          text: true,
          type: true,
          answers: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              text: true,
            },
          },
        },
      },
    },
  });

  if (!quiz || quiz.questions.length === 0) {
    return null;
  }

  return {
    id: quiz.id,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      answers: q.answers.map((a) => ({
        id: a.id,
        text: a.text,
      })),
    })),
  };
}
