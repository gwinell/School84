import "server-only";

import { notFound } from "next/navigation";

import prisma from "@/lib/prisma";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";

export async function adminGetCourseAssignments(courseId: string) {
  const { course: authorizedCourse } = await requireCourseTeacher(courseId);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      instructors: {
        where: { user: { organizationMemberships: { some: { organizationId: authorizedCourse.organizationId, role: "TEACHER" } } } },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true } } },
      },
      enrollment: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          accessMode: true,
          status: true,
          dueAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!course) notFound();

  const students = await prisma.user.findMany({
    where: {
      organizationMemberships: { some: { organizationId: authorizedCourse.organizationId, role: "STUDENT" } },
      OR: [{ role: null }, { role: { notIn: ["admin", "teacher"] } }],
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });

  return { ...course, instructors: course.instructors.map(({ user }) => user), students };
}

export type TAdminGetCourseAssignments = Awaited<
  ReturnType<typeof adminGetCourseAssignments>
>;
