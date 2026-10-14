"use server";

import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { detectBot, fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { safeAdminLog } from "@/lib/activity/admin-log";
import { deleteObject } from "@/lib/s3/discard-upload";

const aj = arcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    }),
  )
  .withRule(
    fixedWindow({
      mode: "LIVE",
      window: "1m",
      max: 5,
    }),
  );

export async function deleteCourse({ courseId }: { courseId: string }) {
  const session = await requireAdmin();

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests", null);
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
        fileKey: true,
        courseChapters: {
          select: {
            lessons: {
              select: { videoKey: true },
            },
          },
        },
      },
    });

    if (!course) {
      return errorResponse("Course not found", null);
    }

    // CourseChapter and Lesson cascade on delete from the schema, so deleting
    // the course removes its chapters and lessons in the same transaction.
    await prisma.course.delete({
      where: { id: courseId },
    });

    // Best-effort: clean up Tigris objects now that nothing references them.
    const keysToDelete = [
      course.fileKey,
      ...course.courseChapters.flatMap((c) =>
        c.lessons.map((l) => l.videoKey),
      ),
    ].filter((k): k is string => Boolean(k));

    await Promise.all(keysToDelete.map(deleteObject));
    if (keysToDelete.length > 0) {
      await prisma.pendingUpload
        .deleteMany({ where: { key: { in: keysToDelete } } })
        .catch(() => {});
    }

    await safeAdminLog({
      action: "COURSE_DELETED",
      entityType: "COURSE",
      entityId: course.id,
      entityLabel: course.title,
      metadata: { slug: course.slug },
    });

    revalidatePath("/admin/courses");

    return successResponse("Course deleted successfully", null);
  } catch {
    return errorResponse("Failed to delete course", null);
  }
}
