import "server-only";

import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/app/data/user/require-user";
import type { OrganizationRole } from "@/lib/generated/prisma/client";

/** Global administrators are platform operators; every other permission is tenant membership scoped. */
export async function requireOrganizationRole(
  organizationId: string,
  roles: OrganizationRole[],
) {
  const session = await requireUser();
  if (session.user.role === "admin") return { session, membership: null };

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
  });
  if (!membership || !roles.includes(membership.role)) redirect("/not-admin");
  return { session, membership };
}

export async function resolveTenantCourse(organizationSlug: string, courseSlug: string) {
  const course = await prisma.course.findFirst({
    where: {
      slug: courseSlug,
      organization: { slug: organizationSlug },
    },
    include: {
      organization: {
        select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
      },
    },
  });
  if (!course) notFound();
  return course;
}
