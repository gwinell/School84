import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";

import prisma from "@/lib/prisma";

import { generateVerificationCode } from "./generate-verification-code";

export type IssueCertificateResult =
  | { issued: false; reason: "already-exists" | "not-complete" | "no-lessons" | "private-course" }
  | { issued: true; verificationCode: string };

export async function issueCertificateIfEligible({
  userId,
  courseId,
}: {
  userId: string;
  courseId: string;
}): Promise<IssueCertificateResult> {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
        level: true,
        duration: true,
        status: true,
        organization: { select: { type: true } },
        user: { select: { name: true } },
        courseChapters: {
          select: {
            lessons: { select: { id: true, cells: { select: { id: true } } } },
          },
        },
      },
    });

    if (!course || course.status !== "PUBLISHED") {
      return { issued: false, reason: "not-complete" } as const;
    }

    if (course.organization?.type === "PERSONAL") {
      return { issued: false, reason: "private-course" } as const;
    }

    const existing = await tx.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { verificationCode: true },
    });

    if (existing) {
      return { issued: false, reason: "already-exists" } as const;
    }

    const lessonIds = course.courseChapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => lesson.id),
    );
    const totalLessons = lessonIds.length;

    if (totalLessons === 0) {
      return { issued: false, reason: "no-lessons" } as const;
    }

    const completedCount = await tx.lessonProgress.count({
      where: {
        userId,
        lessonId: { in: lessonIds },
        completed: true,
      },
    });

    if (completedCount < totalLessons) {
      return { issued: false, reason: "not-complete" } as const;
    }

    // Lesson flags can predate new cells. Check the current curriculum before
    // issuing a certificate; only server-validated cell progress counts.
    const cellIds = course.courseChapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) => lesson.cells.map((cell) => cell.id)),
    );
    if (cellIds.length > 0 && (await tx.lessonCellProgress.count({
      where: { userId, lessonCellId: { in: cellIds }, status: "PASSED" },
    })) !== cellIds.length) {
      return { issued: false, reason: "not-complete" } as const;
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      return { issued: false, reason: "not-complete" } as const;
    }

    const verificationCode = generateVerificationCode();

    try {
      await tx.certificate.create({
        data: {
          verificationCode,
          userId,
          courseId: course.id,
          courseIdSnapshot: course.id,
          courseTitleSnapshot: course.title,
          courseSlugSnapshot: course.slug,
          levelSnapshot: course.level,
          durationSnapshot: course.duration,
          instructorNameSnapshot: course.user.name,
          lessonsCountSnapshot: totalLessons,
          recipientName: user.name,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { issued: false, reason: "already-exists" } as const;
      }
      throw error;
    }

    return { issued: true, verificationCode } as const;
  });
}
