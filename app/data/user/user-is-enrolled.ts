import "server-only";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";

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

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      userId: resolvedUserId,
      courseId,
      status: "Active",
      course: { organization: { memberships: { some: { userId: resolvedUserId, role: "STUDENT" } } } },
    },
    select: {
      status: true,
    },
  });

  return Boolean(enrollment);
}
