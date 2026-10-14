import "server-only";

import prisma from "@/lib/prisma";
import { requireTeacher } from "./require-teacher";
import { notFound, redirect } from "next/navigation";

export async function requireCourseTeacher(courseId: string) {
  const session = await requireTeacher();
  if (
    session.user.role !== "admin" &&
    !(await prisma.courseInstructor.findUnique({
      where: { courseId_userId: { courseId, userId: session.user.id } },
      select: { courseId: true },
    }))
  ) {
    redirect("/not-admin");
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true },
  });
  if (!course) notFound();
  return { session, course };
}
