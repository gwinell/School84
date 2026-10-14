import "server-only";

import prisma from "@/lib/prisma";
import { getDownloadUrl, getDownloadUrls } from "@/lib/s3/get-download-url";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { notFound } from "next/navigation";

export async function adminGetCourse(courseId: string) {
  await requireCourseTeacher(courseId);

  const course = await prisma.course.findUnique({
    where: {
      id: courseId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      smallDesc: true,
      duration: true,
      level: true,
      status: true,
      priceCents: true,
      fileKey: true,
      slug: true,
      createdAt: true,
      updatedAt: true,

      categories: {
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      },

      courseChapters: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              videoKey: true,
              position: true,
            },
          },
        },
      },
    },
  });

  if (!course) {
    notFound();
  }

  const lessons = course.courseChapters.flatMap((c) => c.lessons);

  const [imageUrl, videoUrls] = await Promise.all([
    getDownloadUrl(course.fileKey),
    getDownloadUrls(lessons.map((l) => l.videoKey)),
  ]);

  let cursor = 0;

  return {
    ...course,
    imageUrl,
    courseChapters: course.courseChapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => {
        const li = cursor++;
        return { ...lesson, videoUrl: videoUrls[li] ?? null };
      }),
    })),
  };
}

export type tAdminGetCourse = Awaited<ReturnType<typeof adminGetCourse>>;
