"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { errorResponse, successResponse } from "@/lib/responses";
import {
  ChapterSchemaType,
  type CourseSchemaType,
  LessonSchemaType,
  chapterSchema,
  courseSchema,
  lessonSchema,
} from "@/lib/zodSchemas";
import { deriveCourseSlug } from "@/lib/formatSlug";
import { z } from "zod";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import arcjet, { detectBot, fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { adminLog, safeAdminLog } from "@/lib/activity/admin-log";
import {
  buildCourseFieldChanges,
  snapshotCourse,
} from "@/lib/activity/snapshots/course";
import { deleteObject } from "@/lib/s3/discard-upload";
import { isCompletePermutation } from "@/lib/reorder";
import {
  CATEGORY_LIMIT_EXCEEDED,
  resolveCategories,
} from "@/app/data/course/resolve-categories";
import { canUseCourseMediaKeys } from "@/lib/teacher/course-media";

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

export async function updateCourse(courseId: string, values: CourseSchemaType) {
  const { session } = await requireCourseTeacher(courseId);

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests", null);
    }

    const validatedData = courseSchema.safeParse({
      ...values,
      slug: deriveCourseSlug(values.slug, values.title),
    });

    if (!validatedData.success) {
      return errorResponse("Invalid data", z.treeifyError(validatedData.error));
    }

    const { categories: categoryNames, ...courseFields } = validatedData.data;

    const slugTaken = await prisma.course.findFirst({
      where: { slug: courseFields.slug, NOT: { id: courseId } },
      select: { id: true },
    });
    if (slugTaken) {
      return errorResponse(
        `The slug "${courseFields.slug}" is already in use. Please choose another.`,
        null,
      );
    }

    const before = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        smallDesc: true,
        priceCents: true,
        duration: true,
        level: true,
        status: true,
        fileKey: true,
        categories: { select: { name: true }, orderBy: { name: "asc" } },
      },
    });

    if (!before) {
      return errorResponse("Course not found", null);
    }

    const nextFileKey = courseFields.fileKey ?? null;
    if (!(await canUseCourseMediaKeys({
      keys: nextFileKey ? [nextFileKey] : [],
      existingKeys: before.fileKey ? [before.fileKey] : [],
      courseId,
      userId: session.user.id,
      role: session.user.role,
    }))) {
      return errorResponse("Course image upload is not available", null);
    }

    let course;
    let resolvedCategoryNames: string[] = [];
    try {
      course = await prisma.$transaction(async (tx) => {
        const categories = await resolveCategories(categoryNames, tx);
        resolvedCategoryNames = categories.map((c) => c.name);

        const updated = await tx.course.update({
          where: { id: courseId },
          data: {
            ...courseFields,
            stripePriceId: null,
            categories: {
              set: categories.map((c) => ({ id: c.id })),
            },
          },
        });

        if (nextFileKey && nextFileKey !== before.fileKey) {
          await tx.pendingUpload
            .deleteMany({
              where: {
                key: nextFileKey,
                userId: session.user.id,
                courseId,
              },
            })
            .catch(() => {});
        }

        return updated;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return errorResponse(
          "That slug is already in use. Please choose another.",
          null,
        );
      }
      if (err instanceof CATEGORY_LIMIT_EXCEEDED) {
        return errorResponse(err.message, null);
      }
      throw err;
    }

    // If the thumbnail was replaced or removed, delete the previous object
    // from Tigris (best-effort) so it doesn't leak.
    if (before.fileKey && before.fileKey !== course.fileKey) {
      await deleteObject(before.fileKey);
      await prisma.pendingUpload
        .delete({ where: { key: before.fileKey } })
        .catch(() => {});
    }

    if (before) {
      const beforeSnapshot = snapshotCourse({
        ...before,
        categories: before.categories,
      });
      const afterSnapshot = snapshotCourse({
        ...course,
        categories: resolvedCategoryNames.map((name) => ({ name })),
      });

      const statusChanged = beforeSnapshot.status !== afterSnapshot.status;
      const changedFields = buildCourseFieldChanges(beforeSnapshot, afterSnapshot);

      if (statusChanged) {
        await safeAdminLog({
          action: "COURSE_STATUS_CHANGED",
          entityType: "COURSE",
          entityId: course.id,
          entityLabel: course.title,
          metadata: {
            from: beforeSnapshot.status,
            to: afterSnapshot.status,
            ...(Object.keys(changedFields).length > 0
              ? { fields: changedFields }
              : {}),
          },
        });
      } else if (Object.keys(changedFields).length > 0) {
        await safeAdminLog({
          action: "COURSE_UPDATED",
          entityType: "COURSE",
          entityId: course.id,
          entityLabel: course.title,
          metadata: { fields: changedFields },
        });
      }
    }

    return successResponse("Course updated successfully", course);
  } catch (error) {
    console.error("Failed to update course:", error);
    return errorResponse("Failed to update course", null);
  }
}

interface iReorderLessonsProps {
  courseId: string;
  lessons: { id: string; position: number }[];
  chapterId: string;
}

export async function reorderLessons({
  courseId,
  lessons,
  chapterId,
}: iReorderLessonsProps) {
  try {
    if (!lessons || lessons.length === 0) {
      return errorResponse("No lessons provided", null);
    }

    if (!chapterId) {
      return errorResponse("Chapter ID is required", null);
    }

    await requireCourseTeacher(courseId);

    const chapter = await prisma.courseChapter.findUnique({
      where: { id: chapterId },
      select: { courseId: true, lessons: { select: { id: true } } },
    });

    if (!chapter || chapter.courseId !== courseId) {
      return errorResponse("Chapter not found", null);
    }

    if (
      !isCompletePermutation(
        lessons,
        chapter.lessons.map((lesson) => lesson.id),
        1,
      )
    ) {
      return errorResponse("Invalid lesson order", null);
    }

    // Two-step update to avoid unique constraint violations on (chapterId, position):
    // first move every row to a temporary negative position, then set final positions.
    const tempUpdates = lessons.map((lesson, index) =>
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { position: -(index + 1) },
      }),
    );
    const finalUpdates = lessons.map((lesson) =>
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { position: lesson.position },
      }),
    );

    await prisma.$transaction([...tempUpdates, ...finalUpdates]);

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return successResponse("Lessons reordered successfully", finalUpdates);
  } catch {
    return errorResponse("Failed to reorder lessons", null);
  }
}

interface iReorderChaptersProps {
  courseId: string;
  chapters: { id: string; position: number }[];
}

export async function reorderChapters({
  courseId,
  chapters,
}: iReorderChaptersProps) {
  try {
    if (!chapters || chapters.length === 0) {
      return errorResponse("No chapters provided", null);
    }

    if (!courseId) {
      return errorResponse("Course ID is required", null);
    }

    await requireCourseTeacher(courseId);

    const existingChapters = await prisma.courseChapter.findMany({
      where: { courseId },
      select: { id: true },
    });

    if (
      !isCompletePermutation(
        chapters,
        existingChapters.map((chapter) => chapter.id),
        1,
      )
    ) {
      return errorResponse("Invalid chapter order", null);
    }

    // Two-step update to avoid unique constraint violations on (courseId, position):
    // first move every row to a temporary negative position, then set final positions.
    const tempUpdates = chapters.map((chapter, index) =>
      prisma.courseChapter.update({
        where: { id: chapter.id },
        data: { position: -(index + 1) },
      }),
    );
    const finalUpdates = chapters.map((chapter) =>
      prisma.courseChapter.update({
        where: { id: chapter.id },
        data: { position: chapter.position },
      }),
    );

    await prisma.$transaction([...tempUpdates, ...finalUpdates]);

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return successResponse("Chapters reordered successfully", finalUpdates);
  } catch {
    return errorResponse("Failed to reorder chapters", null);
  }
}

export async function createChapter(values: ChapterSchemaType) {
  try {
    const validatedData = chapterSchema.safeParse(values);

    if (!validatedData.success) {
      return errorResponse("Invalid data", z.treeifyError(validatedData.error));
    }
    await requireCourseTeacher(validatedData.data.courseId);

    await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.courseChapter.findFirst({
        where: { courseId: validatedData.data.courseId },
        select: { position: true },
        orderBy: { position: "desc" },
      });

      const created = await tx.courseChapter.create({
        data: {
          title: validatedData.data.name,
          position: (maxPosition?.position ?? 0) + 1,
          courseId: validatedData.data.courseId,
        },
        select: { id: true, title: true },
      });

      await adminLog(
        {
          action: "CHAPTER_CREATED",
          entityType: "CHAPTER",
          entityId: created.id,
          entityLabel: created.title,
          metadata: {
            courseId: validatedData.data.courseId,
            position: (maxPosition?.position ?? 0) + 1,
          },
        },
        tx,
      );
    });

    revalidatePath(`/admin/courses/${validatedData.data.courseId}/edit`);

    return successResponse("Chapter created successfully", null);
  } catch {
    return errorResponse("Failed to create chapter", null);
  }
}

export async function updateChapter({
  courseId,
  chapterId,
  title,
}: {
  courseId: string;
  chapterId: string;
  title: string;
}) {
  await requireCourseTeacher(courseId);
  const cleanTitle = title.trim();
  if (cleanTitle.length < 3 || cleanTitle.length > 120) {
    return errorResponse("Название главы должно содержать от 3 до 120 символов", null);
  }
  try {
    const result = await prisma.courseChapter.updateMany({
      where: { id: chapterId, courseId },
      data: { title: cleanTitle },
    });
    if (!result.count) return errorResponse("Глава не найдена", null);
    revalidatePath(`/admin/courses/${courseId}/edit`);
    revalidatePath(`/admin/courses/${courseId}/chapters/${chapterId}`);
    return successResponse("Глава сохранена", null);
  } catch {
    return errorResponse("Не удалось сохранить главу", null);
  }
}

export async function createLesson(values: LessonSchemaType) {
  try {
    const validatedData = lessonSchema.safeParse(values);

    if (!validatedData.success) {
      return errorResponse("Invalid data", z.treeifyError(validatedData.error));
    }
    const { session } = await requireCourseTeacher(validatedData.data.courseId);
    const chapterExists = await prisma.courseChapter.findFirst({ where: { id: validatedData.data.chapterId, courseId: validatedData.data.courseId }, select: { id: true } });
    if (!chapterExists) return errorResponse("Chapter not found", null);
    if (!(await canUseCourseMediaKeys({
      keys: validatedData.data.videoKey ? [validatedData.data.videoKey] : [],
      courseId: validatedData.data.courseId,
      userId: session.user.id,
      role: session.user.role,
    }))) {
      return errorResponse("Video upload is not available", null);
    }

    await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.lesson.findFirst({
        where: { chapterId: validatedData.data.chapterId },
        select: { position: true },
        orderBy: { position: "desc" },
      });

        const created = await tx.lesson.create({
          data: {
            title: validatedData.data.name,
            description: validatedData.data.description,
            videoKey: validatedData.data.videoKey,
            position: (maxPosition?.position ?? 0) + 1,
            chapterId: validatedData.data.chapterId,
          },
          select: { id: true, title: true },
        });

        if (validatedData.data.videoKey) {
          await tx.pendingUpload
            .deleteMany({
              where: {
                key: validatedData.data.videoKey,
                userId: session.user.id,
                courseId: validatedData.data.courseId,
              },
            })
            .catch(() => {});
        }

      await adminLog(
        {
          action: "LESSON_CREATED",
          entityType: "LESSON",
          entityId: created.id,
          entityLabel: created.title,
          metadata: {
            courseId: validatedData.data.courseId,
            chapterId: validatedData.data.chapterId,
          },
        },
        tx,
      );
    });

    revalidatePath(`/admin/courses/${validatedData.data.courseId}/edit`);

    return successResponse("Lesson created successfully", null);
  } catch {
    return errorResponse("Failed to create lesson", null);
  }
}

export async function deleteLesson({
  courseId,
  chapterId,
  lessonId,
}: {
  courseId: string;
  chapterId: string;
  lessonId: string;
}) {
  await requireCourseTeacher(courseId);

  try {
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, chapterId, chapter: { courseId } },
      select: { videoKey: true },
    });

    if (!lesson) {
      return errorResponse("Lesson not found", null);
    }

    const chapterwithlessons = await prisma.courseChapter.findFirst({
      where: { id: chapterId, courseId },
      select: {
        lessons: {
          orderBy: { position: "asc" },
          select: { id: true, position: true, title: true },
        },
      },
    });

    if (!chapterwithlessons) {
      return errorResponse("Chapter not found", null);
    }

    const lessons = chapterwithlessons.lessons;

    if (lessons.length === 0) {
      return errorResponse("No lessons found", null);
    }

    const lessonToDelete = lessons.find((l) => l.id === lessonId);
    if (!lessonToDelete) {
      return errorResponse("Lesson not found", null);
    }

    const remainingLessons = lessons.filter((l) => l.id !== lessonId);

    // Two-step reposition to avoid @@unique([chapterId, position]) violations:
    // move remaining lessons to temporary negative positions, delete the target,
    // then set final positions. Order matters — the deleted lesson keeps its
    // position until the delete runs, so direct repositioning would clash.
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        remainingLessons.map((lesson, index) =>
          tx.lesson.update({
            where: { id: lesson.id },
            data: { position: -(index + 1) },
          }),
        ),
      );

      await tx.lesson.delete({ where: { id: lessonId } });

      await Promise.all(
        remainingLessons.map((lesson, index) =>
          tx.lesson.update({
            where: { id: lesson.id },
            data: { position: index + 1 },
          }),
        ),
      );

      await adminLog(
        {
          action: "LESSON_DELETED",
          entityType: "LESSON",
          entityId: lessonId,
          entityLabel: lessonToDelete.title,
          metadata: { courseId, chapterId },
        },
        tx,
      );
    });

    if (lesson.videoKey) {
      await deleteObject(lesson.videoKey);
      await prisma.pendingUpload
        .delete({ where: { key: lesson.videoKey } })
        .catch(() => {});
    }

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return successResponse("Lesson deleted successfully", null);
  } catch {
    return errorResponse("Failed to delete lesson", null);
  }
}

export async function deleteChapter({
  courseId,
  chapterId,
}: {
  courseId: string;
  chapterId: string;
}) {
  await requireCourseTeacher(courseId);

  try {
    const courseWithChapters = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        courseChapters: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            title: true,
            lessons: { select: { videoKey: true } },
          },
        },
      },
    });

    if (!courseWithChapters) {
      return errorResponse("Course chapters not found", null);
    }

    const chapters = courseWithChapters.courseChapters;

    if (chapters.length === 0) {
      return errorResponse("No chapters found", null);
    }

    const chapterToDelete = chapters.find(
      (chapter) => chapter.id === chapterId,
    );
    if (!chapterToDelete) {
      return errorResponse("Chapter not found", null);
    }

    const chapterToDeleteVideos = chapterToDelete.lessons.map(
      (l) => l.videoKey,
    );

    const remainingChapters = chapters.filter(
      (chapter) => chapter.id !== chapterId,
    );

    // Two-step reposition to avoid @@unique([courseId, position]) violations:
    // move remaining chapters to temporary negative positions, delete the
    // target, then set final positions. Without temp moves, sequential updates
    // would clash with the not-yet-deleted chapter's position (and with each
    // other mid-transaction), throwing inside $transaction.
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        remainingChapters.map((chapter, index) =>
          tx.courseChapter.update({
            where: { id: chapter.id },
            data: { position: -(index + 1) },
          }),
        ),
      );

      await tx.courseChapter.delete({ where: { id: chapterId } });

      await Promise.all(
        remainingChapters.map((chapter, index) =>
          tx.courseChapter.update({
            where: { id: chapter.id },
            data: { position: index + 1 },
          }),
        ),
      );

      await adminLog(
        {
          action: "CHAPTER_DELETED",
          entityType: "CHAPTER",
          entityId: chapterId,
          entityLabel: chapterToDelete.title,
          metadata: { courseId },
        },
        tx,
      );
    });

    const keysToDelete = chapterToDeleteVideos.filter(
      (k): k is string => Boolean(k),
    );
    if (keysToDelete.length > 0) {
      await Promise.all(keysToDelete.map(deleteObject));
      await prisma.pendingUpload
        .deleteMany({ where: { key: { in: keysToDelete } } })
        .catch(() => {});
    }

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return successResponse("Chapter deleted successfully", null);
  } catch {
    return errorResponse("Failed to delete chapter", null);
  }
}
