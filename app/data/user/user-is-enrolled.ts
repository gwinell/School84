import "server-only";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { getCourseLearnerAccess } from "./course-learner-access";

export async function checkIfCourseBought({
  courseId,
  userId,
}: {
  courseId: string;
  /**
   * The caller's already-resolved user id. Pass it to avoid a second session
   * lookup; pass `null` for a known signed-out viewer.
   */
  userId?: string | null;
}) {
  let resolvedUserId = userId;

  if (resolvedUserId === undefined) {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) return false;
    resolvedUserId = session.user.id;
  }

  if (!resolvedUserId) return false;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { organizationId: true } });
  if (!course) return false;
  return Boolean(await getCourseLearnerAccess({ userId: resolvedUserId, userRole: null, courseId, organizationId: course.organizationId }));
}
