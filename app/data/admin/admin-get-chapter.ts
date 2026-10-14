import "server-only";

import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireAdmin } from "./require-admin";

export async function adminGetChapter(chapterId: string) {
  await requireAdmin();
  const chapter = await prisma.courseChapter.findUnique({
    where: { id: chapterId },
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
