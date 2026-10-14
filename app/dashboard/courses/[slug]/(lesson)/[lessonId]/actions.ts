"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccessAssignedLesson } from "@/lib/course-access";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { type tApiResponse } from "@/types/api";
import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 30,
  }),
);

interface SetLessonCompletionInput {
  lessonId: string;
  completed: boolean;
}

export async function setLessonCompletionAction({
  lessonId,
  completed,
}: SetLessonCompletionInput): Promise<tApiResponse<null>> {
  const session = await requireUser();
  if (!z.object({ lessonId: z.string().min(1), completed: z.boolean() }).safeParse({ lessonId, completed }).success) {
    return errorResponse("Invalid lesson progress", null);
  }

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please try again later.", null);
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        chapter: {
          select: {
            course: {
              select: { id: true, slug: true, status: true, organizationId: true },
            },
          },
        },
      },
    });

    if (!lesson || lesson.chapter.course.status !== "PUBLISHED") {
      return errorResponse("Lesson not found", null);
    }

    const { id: courseId, slug } = lesson.chapter.course;

    const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId, organizationId: lesson.chapter.course.organizationId });
    if (!enrollment) {
      return errorResponse("You are not enrolled in this course", null);
    }

    if (enrollment.accessMode === "SEQUENTIAL" && !(await canAccessAssignedLesson({
      userId: session.user.id, courseId, lessonId,
    }))) {
      return errorResponse("Complete all accepted tasks in previous lessons first", null);
    }
    if (completed) {
      const cells = await prisma.lessonCell.findMany({ where: { lessonId }, select: { id: true } });
      const passedCount = cells.length ? await prisma.lessonCellProgress.count({
        where: { userId: session.user.id, lessonCellId: { in: cells.map((cell) => cell.id) }, status: "PASSED" },
      }) : 0;
      if (passedCount !== cells.length) {
        return errorResponse("Complete every lesson cell before marking the lesson complete", null);
      }
    }

    await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: session.user.id,
          lessonId,
        },
      },
      create: {
        userId: session.user.id,
        lessonId,
        completed,
      },
      update: {
        completed,
      },
    });

    revalidatePath(`/dashboard/courses/${slug}/${lessonId}`);
    revalidatePath(`/dashboard/courses/${slug}`);
    revalidatePath("/dashboard");
    return successResponse(
      completed ? "Lesson marked as completed" : "Lesson marked as incomplete",
      null,
    );
  } catch {
    return errorResponse("Failed to update progress", null);
  }
}
