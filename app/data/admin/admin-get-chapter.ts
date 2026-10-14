import "server-only";

import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { getManagedCourseIds } from "@/app/data/teacher/get-managed-course-ids";

export async function adminGetChapter(chapterId: string) {
  const session = await requireTeacher();
  const managedCourseIds = await getManagedCourseIds(session.user.id, session.user.role);
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
