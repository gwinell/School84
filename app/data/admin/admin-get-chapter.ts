import "server-only";

import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireTeacher } from "@/app/data/teacher/require-teacher";

export async function adminGetChapter(chapterId: string) {
  const session = await requireTeacher();
  const managedCourseIds = session.user.role === "admin"
    ? null
    : (await prisma.courseInstructor.findMany({ where: { userId: session.user.id }, select: { courseId: true } })).map((row) => row.courseId);
  const chapter = await prisma.courseChapter.findFirst({
    where: { id: chapterId, ...(managedCourseIds ? { courseId: { in: managedCourseIds } } : {}) },
    select: {
      id: true,
      title: true,
      position: true,
      courseId: true,
      course: {
        select: {
          title: true,
          courseChapters: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              lessons: {
                orderBy: { position: "asc" },
                select: { id: true, title: true },
              },
            },
          },
        },
      },
      lessons: {
        orderBy: { position: "asc" },
        select: { id: true, title: true, position: true },
      },
    },
  });
  if (!chapter) notFound();
  return chapter;
}

export type tAdminGetChapter = Awaited<ReturnType<typeof adminGetChapter>>;
