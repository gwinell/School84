import "server-only";

import prisma from "@/lib/prisma";

export async function isOrganizationMember(userId: string, organizationId: string) {
  return Boolean(await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { userId: true },
  }));
}
