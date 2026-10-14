import "server-only";

import prisma from "@/lib/prisma";
import { requireUser } from "@/app/data/user/require-user";
import { redirect } from "next/navigation";

export async function requireTeacher() {
  const session = await requireUser();
  if (session.user.role === "admin") return session;
  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN", "TEACHER"] } },
    select: { organizationId: true },
  });
  if (!membership) {
    redirect("/not-admin");
  }
  return session;
}
