import "server-only";

import prisma from "@/lib/prisma";
import { requireTeacher } from "./require-teacher";
import { notFound, redirect } from "next/navigation";
import { canManageCourse } from "@/lib/organization/access-policy";

export async function requireCourseTeacher(courseId: string) {
  const session = await requireTeacher();
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true, organizationId: true },
  });
  if (!course) notFound();

  // A platform administrator can support any school. Everyone else must be a
  // tenant member; a teacher also needs an explicit assignment to this course.
  if (session.user.role !== "admin") {
    const [membership, instructor] = await Promise.all([
      prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: course.organizationId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      prisma.courseInstructor.findUnique({
        where: { courseId_userId: { courseId, userId: session.user.id } },
        select: { courseId: true },
      }),
    ]);
    if (!canManageCourse({ userRole: session.user.role, membershipRole: membership?.role, isCourseInstructor: Boolean(instructor) })) {
      redirect("/not-admin");
    }
  }
  return { session, course };
}
