import "server-only";

import prisma from "@/lib/prisma";

/** Active learning requires enrollment plus either a school STUDENT role or personal-workspace ownership. */
export async function getCourseLearnerAccess({
  userId,
  userRole,
  organizationId,
  courseId,
}: {
  userId: string;
  userRole: string | null | undefined;
  organizationId: string;
  courseId: string;
}) {
  if (userRole === "admin") return { status: "Active" as const, accessMode: "ALL_AT_ONCE" as const };
  const [organization, enrollment] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        type: true,
        ownerUserId: true,
        memberships: { where: { userId }, select: { role: true }, take: 1 },
      },
    }),
    prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { status: true, accessMode: true },
    }),
  ]);
  const isSchoolStudent = organization?.type === "SCHOOL" && organization.memberships[0]?.role === "STUDENT";
  const ownsPersonalWorkspace = organization?.type === "PERSONAL" && organization.ownerUserId === userId;
  if ((!isSchoolStudent && !ownsPersonalWorkspace) || enrollment?.status !== "Active") return null;
  return enrollment;
}
