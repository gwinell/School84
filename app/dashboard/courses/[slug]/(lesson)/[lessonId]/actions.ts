"use server";

import { revalidatePath } from "next/cache";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { type tApiResponse } from "@/types/api";
import { requireUser } from "@/app/data/user/require-user";

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
              select: { id: true, slug: true },
            },
          },
        },
      },
    });

    if (!lesson) {
      return errorResponse("Lesson not found", null);
    }

    const { id: courseId, slug } = lesson.chapter.course;

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
      select: { status: true },
    });

    if (!enrollment || enrollment.status !== "Active") {
      return errorResponse("You are not enrolled in this course", null);
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
