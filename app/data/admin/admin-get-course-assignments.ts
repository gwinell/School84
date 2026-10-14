import "server-only";

import { notFound } from "next/navigation";

import prisma from "@/lib/prisma";
import { requireAdmin } from "./require-admin";

export async function adminGetCourseAssignments(courseId: string) {
  await requireAdmin();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      enrollment: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          accessMode: true,
          status: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!course) notFound();

  const students = await prisma.user.findMany({
    where: { OR: [{ role: null }, { role: { not: "admin" } }] },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });

  return { ...course, students };
}

export type TAdminGetCourseAssignments = Awaited<
  ReturnType<typeof adminGetCourseAssignments>
>;
