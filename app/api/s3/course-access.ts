import prisma from "@/lib/prisma";
import { canManageCourse } from "@/lib/organization/access-policy";

/** Shared authorization for course-scoped media endpoints. */
export async function canAccessUploadCourse(input: {
  role: string | null | undefined;
  userId: string;
  courseId?: string;
}): Promise<boolean> {
  if (!input.courseId) return input.role === "admin";

  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: { id: true, organizationId: true },
  });
  if (!course) return false;
  if (input.role === "admin") return true;
  const [membership, instructor] = await Promise.all([
    prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: course.organizationId, userId: input.userId } },
      select: { role: true },
    }),
    prisma.courseInstructor.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: input.userId } },
      select: { courseId: true },
    }),
  ]);
  return canManageCourse({ userRole: input.role, membershipRole: membership?.role, isCourseInstructor: Boolean(instructor) });
}
