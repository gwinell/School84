import "server-only";

import prisma from "@/lib/prisma";

/** Active learning requires both a current STUDENT membership and enrollment. */
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
  const [membership, enrollment] = await Promise.all([
    prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    }),
    prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { status: true, accessMode: true },
    }),
  ]);
  if (membership?.role !== "STUDENT" || enrollment?.status !== "Active") return null;
  return enrollment;
}
